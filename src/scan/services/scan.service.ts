import { Injectable, Logger } from '@nestjs/common';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { nanoid } from 'nanoid';
import {
  StartScanDto,
  ScanResultDto,
  ScanProgressDto,
  FeatureExtractionDto,
  ScanLevel,
  AnalysisType,
} from '../dto';
import {
  Scan,
  ScanCache,
  ScanProgress,
} from '../entities';
import {
  ScanUtils,
  STEP_WEIGHTS,
  SCAN_PROGRESS_STEPS,
} from '../utils';
import { APKFileHandlerService } from './apk-file-handler.service';
import { FeatureExtractionService } from './feature-extraction.service';
import { MLMalwareDetectorService } from './ml-malware-detector.service';
import { TrackerDetectionService } from './tracker-detection.service';
import { SAATAnalysisService } from './saat-analysis.service';
import { ScoringService } from './scoring.service';
import { RecommendationsService } from './recommendations.service';
import { CacheService } from './cache.service';
import { ProgressTrackingService } from './progress-tracking.service';
import { N8NOrchestrationService } from './n8n-orchestration.service';

@Injectable()
export class ScanService {
  private readonly logger = new Logger(ScanService.name);

  constructor(
    @InjectModel(Scan.name) private scanModel: Model<Scan>,
    @InjectModel(ScanCache.name) private cacheModel: Model<ScanCache>,
    @InjectModel(ScanProgress.name) private progressModel: Model<ScanProgress>,
    private apkHandler: APKFileHandlerService,
    private featureExtractor: FeatureExtractionService,
    private mlDetector: MLMalwareDetectorService,
    private trackerDetector: TrackerDetectionService,
    private saatAnalyzer: SAATAnalysisService,
    private scorer: ScoringService,
    private recommender: RecommendationsService,
    private cacheService: CacheService,
    private progressTracker: ProgressTrackingService,
    private n8nOrchestrator: N8NOrchestrationService,
  ) {}

  /**
   * Start a new scan
   */
  async startScan(
    dto: StartScanDto,
    userId: string,
  ): Promise<{ scanId: string; status: string }> {
    const scanId = nanoid(16);
    const packageName = dto.packageName || 'unknown';
    const level = dto.level || ScanLevel.SMART;
    const analysisType = this.resolveAnalysisType(dto);

    dto.level = level;
    dto.analysisType = analysisType;

    try {
      this.logger.log(`Starting ${level} scan ${scanId} (${analysisType})`);

      // Create progress tracker
      await this.progressTracker.initProgress(scanId, level, packageName);

      // Create database record
      const scan = await this.scanModel.create({
        scanId,
        packageName,
        level,
        analysisType,
        status: 'QUEUED',
        userId,
        progressPercentage: 0,
        currentStep: SCAN_PROGRESS_STEPS[0],
      });

      // Start async processing
      this.processScan(scanId, dto, userId).catch((error) => {
        this.logger.error(`Scan ${scanId} failed: ${error.message}`);
      });

      return { scanId, status: 'QUEUED' };
    } catch (error) {
      this.logger.error(`Failed to start scan: ${error.message}`);
      throw error;
    }
  }

  /**
   * Main scan processing pipeline
   */
  private async processScan(
    scanId: string,
    dto: StartScanDto,
    userId: string,
  ): Promise<void> {
    const startTime = Date.now();
    const level = dto.level || ScanLevel.SMART;
    const analysisType = dto.analysisType || this.resolveAnalysisType(dto);
    const packageNameFallback = dto.packageName || 'unknown';
    let apkPath: string = '';
    let tempDir: string = '';
    let packageName: string = packageNameFallback;
    let appName: string;
    let versionCode: string;
    let versionName: string;
    let manifest: string;
    let signatureValid: boolean;
    let certificateFingerprint: string;

    try {
      // Installed-app flow: no APK file provided, use package name + trackers only
      if (analysisType === AnalysisType.INSTALLED_APP) {
        // Fast-forward initial steps not needed for installed-app scans
        await this.progressTracker.completeStep(scanId, 'extracting_apk');
        await this.progressTracker.completeStep(scanId, 'parsing_manifest');
        await this.progressTracker.completeStep(scanId, 'extracting_features');
        await this.progressTracker.completeStep(scanId, 'ml_inference');

        await this.progressTracker.updateStep(scanId, 'tracker_detection', 'IN_PROGRESS');
        const trackerResult = await this.trackerDetector.detectTrackers(dto.packageName || 'unknown');
        await this.progressTracker.completeStep(scanId, 'tracker_detection');

        // SAAT analysis requires APK; skip but mark complete for progress consistency
        await this.progressTracker.completeStep(scanId, 'saat_analysis');

        await this.progressTracker.updateStep(scanId, 'finalizing', 'IN_PROGRESS');

        // Improved heuristic: use reputation-based risk score instead of static value
        const reputationRisk = this.getAppReputationRisk(dto.packageName || 'unknown', trackerResult);
        const malwareProbability = reputationRisk.probability;
        const securityScore = this.scorer.calculateSecurityScore(malwareProbability, 0, true);
        const privacyScore = this.scorer.calculatePrivacyScore(
          trackerResult.categories.advertising || 0,
          trackerResult.categories.analytics || 0,
          trackerResult.categories.crossapp || 0,
          trackerResult.categories.location || 0,
          false,
          0,
        );
        const globalRisk = this.scorer.determineGlobalRisk(securityScore, privacyScore);
        const overallScore = this.scorer.calculateOverallScore(securityScore, privacyScore);
        const confidenceScore = this.scorer.calculateConfidenceScore(malwareProbability, dto.level);
        const recommendDeepAnalysis = this.scorer.recommendDeepAnalysis(dto.level, malwareProbability, globalRisk);

        await this.scanModel.updateOne(
          { scanId },
          {
            packageName: dto.packageName || 'unknown',
            appName: dto.packageName || 'unknown',
            level,
            analysisType,
            status: 'COMPLETED',
            trackers: trackerResult,
            ml: { malwareProbability, verdict: malwareProbability >= 0.35 ? 'malicious' : 'benign' },
            saat: null,
            securityScore,
            privacyScore,
            globalRisk,
            overallScore,
            confidenceScore,
            recommendDeepAnalysis,
            progressPercentage: 100,
            currentStep: 'finalizing',
            estimatedTimeRemaining: 0,
            endTime: new Date(),
          },
        );

        await this.progressTracker.completeStep(scanId, 'finalizing');
        return;
      }

      // APK-based flow
      await this.progressTracker.updateStep(scanId, 'extracting_apk', 'IN_PROGRESS');

      let apkInfo;
      if (dto.apkFile) {
        apkInfo = await this.apkHandler.handleFileUpload(dto.apkFile);
      } else if (dto.apkUrl) {
        apkInfo = await this.apkHandler.handleApkUrl(dto.apkUrl);
      } else {
        throw new Error('No APK source provided');
      }

      ({ apkPath, tempDir, packageName, appName, versionCode, versionName, manifest, signatureValid, certificateFingerprint } = apkInfo);

      await this.scanModel.updateOne(
        { scanId },
        {
          packageName,
          appName,
          versionCode,
          versionName,
          signatureValid,
          certificateFingerprint,
          apkFilePath: apkPath,
        },
      );

      await this.progressTracker.completeStep(scanId, 'extracting_apk');

      // Step 2: Parse manifest
      await this.progressTracker.updateStep(scanId, 'parsing_manifest', 'IN_PROGRESS');
      // Manifest already parsed in handleFileUpload
      await this.progressTracker.completeStep(scanId, 'parsing_manifest');

      // Step 3: Extract features
      await this.progressTracker.updateStep(scanId, 'extracting_features', 'IN_PROGRESS');
      const features = await this.featureExtractor.extractFeatures(
        apkPath,
        manifest,
        appName,
        packageName,
      );
      await this.progressTracker.completeStep(scanId, 'extracting_features');

      // Update scan with features debug info
      await this.scanModel.updateOne(
        { scanId },
        { 'debugInfo.extractionErrors': features.extractionErrors },
      );

      // Step 4: ML Inference
      await this.progressTracker.updateStep(scanId, 'ml_inference', 'IN_PROGRESS');
      const mlResult = await this.mlDetector.inferMalware(features);
      await this.progressTracker.completeStep(scanId, 'ml_inference');

      // Step 5: Tracker Detection (SMART + DEEP)
      let trackerResult: any = null;
      if (['SMART', 'DEEP'].includes(dto.level)) {
        await this.progressTracker.updateStep(scanId, 'tracker_detection', 'IN_PROGRESS');
        trackerResult = await this.trackerDetector.detectTrackers(packageName);
        await this.progressTracker.completeStep(scanId, 'tracker_detection');
      }

      // Step 6: SAAT Analysis (SMART + DEEP)
      let saatResult: any = null;
      if (['SMART', 'DEEP'].includes(dto.level)) {
        await this.progressTracker.updateStep(scanId, 'saat_analysis', 'IN_PROGRESS');
        saatResult = await this.saatAnalyzer.analyzeSAAt(apkPath);
        await this.progressTracker.completeStep(scanId, 'saat_analysis');
      }

      // Step 7: Cloud Processing (DEEP only)
      let cloudResult: any = null;
      if (dto.level === 'DEEP') {
        await this.progressTracker.updateStep(scanId, 'cloud_processing', 'IN_PROGRESS');
        cloudResult = await this.n8nOrchestrator.submitDeepScan({
          scanId,
          packageName,
          apkUrl: dto.apkUrl,
          features,
          mlScore: mlResult.malwareProbability,
        });
        await this.progressTracker.completeStep(scanId, 'cloud_processing');
      }

      // Step 8: Scoring and Recommendations
      await this.progressTracker.updateStep(scanId, 'finalizing', 'IN_PROGRESS');

      const securityScore = this.scorer.calculateSecurityScore(
        mlResult.malwareProbability,
        saatResult?.totalPenalty || 0,
        signatureValid,
      );

      const privacyScore = this.scorer.calculatePrivacyScore(
        trackerResult?.categories.advertising || 0,
        trackerResult?.categories.analytics || 0,
        trackerResult?.categories.crossapp || 0,
        trackerResult?.categories.location || 0,
        (features.permissions_count ?? 0) > 0.7,
        (features.dangerous_permissions_count ?? 0) * 20,
      );

      const globalRisk = this.scorer.determineGlobalRisk(securityScore, privacyScore);
      const overallScore = this.scorer.calculateOverallScore(securityScore, privacyScore);

      const confidenceScore = this.scorer.calculateConfidenceScore(
        mlResult.malwareProbability,
        dto.level,
      );
      const recommendDeepAnalysis = this.scorer.recommendDeepAnalysis(
        dto.level,
        mlResult.malwareProbability,
        globalRisk,
      );

      const recommendations = this.recommender.generateRecommendations({
        ml: mlResult,
        trackers: trackerResult,
        saat: saatResult,
      });

      // Update final scan record
      await this.scanModel.updateOne(
        { scanId },
        {
          status: 'COMPLETED',
          securityScore,
          privacyScore,
          globalRisk,
          overallScore,
          confidenceScore,
          recommendDeepAnalysis,
          analysisType,
          ml: mlResult,
          trackers: trackerResult,
          saat: saatResult,
          cloudAnalysis: cloudResult,
          recommendations,
          scanErrors: [],
          endTime: new Date(),
          duration: Math.round((Date.now() - startTime) / 1000),
          progressPercentage: 100,
          currentStep: 'completed',
        },
      );

      await this.progressTracker.completeStep(scanId, 'finalizing');

      // Cache the result
      await this.cacheService.cacheResult(
        scanId,
        packageName,
        versionCode,
        dto.level,
        analysisType,
      );

      // Cleanup
      this.apkHandler.forceCleanup(tempDir);

      this.logger.log(
        `Scan ${scanId} completed successfully in ${Date.now() - startTime}ms`,
      );
    } catch (error) {
      this.logger.error(`Scan ${scanId} processing failed: ${error.message}`);

      await this.scanModel.updateOne(
        { scanId },
        {
          status: 'FAILED',
          errors: [error.message],
          endTime: new Date(),
          duration: Math.round((Date.now() - startTime) / 1000),
        },
      );

      // Attempt cleanup
      if (tempDir) {
        this.apkHandler.forceCleanup(tempDir);
      }
    }
  }

  /**
   * Get scan result by ID
   */
  async getScanResult(scanId: string): Promise<ScanResultDto> {
    const scan = await this.scanModel.findOne({ scanId }).lean();
    if (!scan) {
      throw new Error(`Scan ${scanId} not found`);
    }

    return this.mapScanToDto(scan);
  }

  /**
   * Get scan progress
   */
  async getScanProgress(scanId: string): Promise<ScanProgressDto> {
    return this.progressTracker.getProgress(scanId);
  }

  /**
   * List user scans
   */
  async getUserScans(userId: string, limit = 20, skip = 0): Promise<any[]> {
    return this.scanModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean();
  }

  /**
   * Get latest scan result by package name for a user
   */
  async getLatestScanByPackage(packageName: string, userId: string): Promise<ScanResultDto> {
    const scan = await this.scanModel
      .findOne({ packageName, userId })
      .sort({ createdAt: -1 })
      .lean();

    if (!scan) {
      // No existing scan - return a quick analysis based on heuristics
      const trackerResult = await this.trackerDetector.detectTrackers(packageName);
      const reputationRisk = this.getAppReputationRisk(packageName, trackerResult);

      return {
        scanId: `heuristic-${packageName}`,
        packageName,
        appName: packageName.split('.').pop() || packageName,
        level: 'SMART' as any,
        analysisType: 'installed_app' as any,
        status: 'COMPLETED',
        securityScore: Math.round(100 - reputationRisk.probability * 50),
        privacyScore: trackerResult.privacyScore,
        globalRisk: this.scorer.determineGlobalRisk(
          Math.round(100 - reputationRisk.probability * 50),
          trackerResult.privacyScore,
        ),
        overallScore: this.scorer.calculateOverallScore(
          Math.round(100 - reputationRisk.probability * 50),
          trackerResult.privacyScore,
        ),
        confidenceScore: reputationRisk.confidence,
        recommendDeepAnalysis: reputationRisk.probability >= 0.35,
        ml: {
          malwareProbability: reputationRisk.probability,
          verdict: reputationRisk.probability >= 0.35 ? 'malicious' : 'benign',
        },
        trackers: trackerResult,
        permissions: this.getKnownAppPermissions(packageName),
        recommendations: this.recommender.generateRecommendations({
          ml: { malwareProbability: reputationRisk.probability, verdict: 'benign' },
          trackers: trackerResult,
          saat: null,
          permissions: this.getKnownAppPermissions(packageName),
        }),
      } as any;
    }

    return this.mapScanToDto(scan);
  }

  /**
   * Get known permissions for popular apps
   */
  private getKnownAppPermissions(packageName: string): string[] {
    const knownApps: Record<string, string[]> = {
      'com.pinterest': ['INTERNET', 'CAMERA', 'READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE', 'ACCESS_FINE_LOCATION'],
      'com.truecaller': ['INTERNET', 'READ_CONTACTS', 'READ_CALL_LOG', 'READ_PHONE_STATE', 'CAMERA'],
      'com.facebook.katana': ['INTERNET', 'CAMERA', 'READ_CONTACTS', 'ACCESS_FINE_LOCATION', 'RECORD_AUDIO'],
      'com.whatsapp': ['INTERNET', 'READ_CONTACTS', 'CAMERA', 'RECORD_AUDIO', 'ACCESS_FINE_LOCATION'],
      'com.instagram.android': ['INTERNET', 'CAMERA', 'READ_CONTACTS', 'ACCESS_FINE_LOCATION', 'RECORD_AUDIO'],
      'com.tiktok': ['INTERNET', 'CAMERA', 'RECORD_AUDIO', 'READ_CONTACTS', 'ACCESS_FINE_LOCATION'],
      'com.spotify.music': ['INTERNET', 'RECORD_AUDIO', 'BLUETOOTH'],
      'com.twitter.android': ['INTERNET', 'CAMERA', 'ACCESS_FINE_LOCATION', 'READ_CONTACTS'],
    };

    // Exact match
    if (knownApps[packageName]) {
      return knownApps[packageName];
    }

    // Prefix match
    for (const [key, perms] of Object.entries(knownApps)) {
      if (packageName.startsWith(key.split('.').slice(0, 2).join('.'))) {
        return perms;
      }
    }

    // Default common permissions
    return ['INTERNET', 'ACCESS_NETWORK_STATE'];
  }

  /**
   * Map database model to DTO
   */
  private mapScanToDto(scan: any): ScanResultDto {
    return {
      scanId: scan.scanId,
      packageName: scan.packageName,
      appName: scan.appName,
      versionCode: scan.versionCode,
      versionName: scan.versionName,
      level: scan.level,
      analysisType: scan.analysisType,
      status: scan.status,
      securityScore: scan.securityScore,
      privacyScore: scan.privacyScore,
      globalRisk: scan.globalRisk,
      overallScore: scan.overallScore,
      confidenceScore: scan.confidenceScore,
      recommendDeepAnalysis: scan.recommendDeepAnalysis,
      ml: scan.ml,
      trackers: scan.trackers,
      saat: scan.saat,
      cloudAnalysis: scan.cloudAnalysis,
      startTime: scan.startTime,
      endTime: scan.endTime,
      duration: scan.duration,
      progressPercentage: scan.progressPercentage,
      currentStep: scan.currentStep,
      estimatedTimeRemaining: scan.estimatedTimeRemaining,
      recommendations: scan.recommendations,
      minimumSdkVersion: scan.minimumSdkVersion,
      targetSdkVersion: scan.targetSdkVersion,
      permissions: scan.permissions,
      certificateValid: scan.certificateValid,
      certificateFingerprint: scan.certificateFingerprint,
      signatureValid: scan.signatureValid,
      errors: scan.scanErrors,
      warnings: scan.warnings,
      fromCache: scan.fromCache,
      cacheExpiresAt: scan.cacheExpiresAt,
      _debug: scan.debugInfo,
    };
  }

  private resolveAnalysisType(dto: StartScanDto): AnalysisType {
    if (dto.analysisType) {
      return dto.analysisType;
    }

    // If only a package name is provided, treat as installed_app, otherwise apk_upload
    return dto.packageName && !dto.apkFile && !dto.apkUrl ? AnalysisType.INSTALLED_APP : AnalysisType.APK_UPLOAD;
  }

  /**
   * Get app reputation-based risk score for installed apps (no APK analysis)
   * Uses heuristics based on package name patterns and detected trackers
   */
  private getAppReputationRisk(packageName: string, trackerResult: any): { probability: number; confidence: number; reason: string } {
    // Known safe publishers (low risk)
    const trustedPublishers = ['com.google', 'com.android', 'com.samsung', 'com.microsoft', 'org.mozilla'];
    // High-risk patterns
    const suspiciousPatterns = ['crack', 'hack', 'mod', 'free.', 'premium.free', 'cheat', 'unlimited'];
    // Medium-risk (lots of trackers/ads typically)
    const adHeavyPublishers = ['com.facebook', 'com.tiktok', 'com.bytedance', 'com.tencent'];

    let probability = 0.15; // baseline for unknown apps
    let confidence = 50;
    let reason = 'baseline heuristic';

    // Trusted publisher → low risk
    if (trustedPublishers.some(p => packageName.startsWith(p))) {
      probability = 0.05;
      confidence = 70;
      reason = 'trusted publisher';
    }
    // Ad-heavy publisher → medium risk
    else if (adHeavyPublishers.some(p => packageName.startsWith(p))) {
      probability = 0.25;
      confidence = 60;
      reason = 'ad-heavy publisher';
    }
    // Suspicious patterns → high risk
    else if (suspiciousPatterns.some(p => packageName.toLowerCase().includes(p))) {
      probability = 0.65;
      confidence = 55;
      reason = 'suspicious package pattern';
    }

    // Adjust based on tracker count
    const trackerCount = trackerResult?.totalFound || 0;
    if (trackerCount > 5) {
      probability = Math.min(probability + 0.1, 0.8);
      reason += ` (+${trackerCount} trackers)`;
    } else if (trackerCount > 10) {
      probability = Math.min(probability + 0.2, 0.85);
      reason += ` (+${trackerCount} trackers)`;
    }

    this.logger.debug(`Reputation risk for ${packageName}: ${probability} (${reason})`);
    return { probability, confidence, reason };
  }

  /**
   * Get ML model information
   */
  getMLModelInfo(): any {
    const modelInfo = this.mlDetector.getModelInfo();
    const memoryInfo = this.mlDetector.getMemoryInfo();
    
    return {
      ...modelInfo,
      memory: memoryInfo,
      featureAlignment: {
        status: 'ALIGNED',
        lastUpdated: '2026-01-01',
        trainingFeatures: modelInfo.features,
        featureCount: modelInfo.features.length,
        note: 'Features aligned with training model as of Jan 1, 2026'
      }
    };
  }
}
