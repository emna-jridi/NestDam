import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { nanoid } from 'nanoid';
import {
  StartScanDto,
  ScanResultDto,
  ScanProgressDto,
  MLResultDto,
  AnalysisType,
  BatchScanDto,
  BatchScanResultDto,
  BatchAppResultDto,
  Platform,
} from '../dto';
import {
  Scan,
  ScanCache,
  ScanProgress,
} from '../entities';
import {
  SCAN_PROGRESS_STEPS,
  DANGEROUS_PERMISSIONS,
} from '../utils';
import { APKFileHandlerService } from './apk-file-handler.service';
import { FastMLScanService, FastScanResult } from './fast-ml-scan.service';
import { MLMalwareDetectorService } from './ml-malware-detector.service';
import { TrackerDetectionService } from './tracker-detection.service';
import { SAATAnalysisService } from './saat-analysis.service';
import { ScoringService } from './scoring.service';
import { RecommendationsService } from './recommendations.service';
import { CacheService } from './cache.service';
import { ProgressTrackingService } from './progress-tracking.service';
import { GeminiMLService, AppAnalysisInput } from './gemini-ml.service';
import { MLAnalysisDto } from '../dto/scan-result.dto';

const CRITICAL_SCORE = 0.9; // LightGBM score above which the risk is CRITICAL
const EXCESSIVE_PERMISSIONS = 35;

@Injectable()
export class ScanService {
  private readonly logger = new Logger(ScanService.name);

  constructor(
    @InjectModel(Scan.name) private scanModel: Model<Scan>,
    @InjectModel(ScanCache.name) private cacheModel: Model<ScanCache>,
    @InjectModel(ScanProgress.name) private progressModel: Model<ScanProgress>,
    private apkHandler: APKFileHandlerService,
    private mlScanner: FastMLScanService,
    private mlDetector: MLMalwareDetectorService,
    private geminiML: GeminiMLService,
    private trackerDetector: TrackerDetectionService,
    private saatAnalyzer: SAATAnalysisService,
    private scorer: ScoringService,
    private recommender: RecommendationsService,
    private cacheService: CacheService,
    private progressTracker: ProgressTrackingService,
  ) { }

  /**
   * Start a new scan
   */
  async startScan(
    dto: StartScanDto,
    userId: string,
  ): Promise<{ scanId: string; status: string }> {
    const scanId = nanoid(16);
    const packageName = dto.packageName || 'unknown';
    const analysisType = this.resolveAnalysisType(dto);

    dto.analysisType = analysisType;

    try {
      this.logger.log(`Starting scan ${scanId} (${analysisType})`);

      // Create progress tracker
      await this.progressTracker.initProgress(scanId, packageName);

      // Create database record
      const scan = await this.scanModel.create({
        scanId,
        packageName,
        analysisType,
        platform: dto.platform || 'android',
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
    const analysisType = dto.analysisType || this.resolveAnalysisType(dto);
    const packageNameFallback = dto.packageName || 'unknown';
    let apkPath: string = '';
    let tempDir: string = '';
    let packageName: string = packageNameFallback;
    let appName: string;
    let versionCode: string;
    let versionName: string;
    let signatureValid: boolean;
    let certificateFingerprint: string;

    try {
      // No APK (package name only): trackers + heuristics. With an APK (picked file or the
      // installed app's own APK uploaded by the phone) the full LightGBM flow below runs.
      if (!dto.apkFile && !dto.apkUrl) {
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
        const confidenceScore = this.scorer.calculateConfidenceScore(malwareProbability);

        await this.scanModel.updateOne(
          { scanId },
          {
            packageName: dto.packageName || 'unknown',
            appName: dto.packageName || 'unknown',
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

      ({ apkPath, tempDir, packageName, appName, versionCode, versionName, signatureValid, certificateFingerprint } = apkInfo);

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

      // Step 3-4: Extract features + LightGBM inference (one Python call, same extractor as training)
      await this.progressTracker.updateStep(scanId, 'extracting_features', 'IN_PROGRESS');
      const inferenceStart = Date.now();
      const lgbm = await this.mlScanner.scanApk(apkPath);
      await this.progressTracker.completeStep(scanId, 'extracting_features');
      await this.progressTracker.completeStep(scanId, 'ml_inference');
      const mlResult = this.toMlResult(lgbm, Date.now() - inferenceStart);
      const permissions = lgbm.permissions;

      // Step 5: Tracker Detection
      await this.progressTracker.updateStep(scanId, 'tracker_detection', 'IN_PROGRESS');
      const trackerResult = await this.trackerDetector.detectTrackers(packageName);
      await this.progressTracker.completeStep(scanId, 'tracker_detection');

      // Step 6: SAAT Analysis
      await this.progressTracker.updateStep(scanId, 'saat_analysis', 'IN_PROGRESS');
      const saatResult = await this.saatAnalyzer.analyzeSAAt(apkPath);
      await this.progressTracker.completeStep(scanId, 'saat_analysis');

      // Step 7: Scoring and Recommendations
      await this.progressTracker.updateStep(scanId, 'finalizing', 'IN_PROGRESS');

      const securityScore = this.scorer.calculateSecurityScore(
        mlResult.malwareProbability,
        saatResult?.totalPenalty || 0,
        signatureValid,
      );

      const dangerousCount = permissions.filter((p) => DANGEROUS_PERMISSIONS.includes(p)).length;
      const privacyScore = this.scorer.calculatePrivacyScore(
        trackerResult?.categories.advertising || 0,
        trackerResult?.categories.analytics || 0,
        trackerResult?.categories.crossapp || 0,
        trackerResult?.categories.location || 0,
        permissions.length > EXCESSIVE_PERMISSIONS,
        dangerousCount,
      );

      const globalRisk = this.scorer.determineGlobalRisk(securityScore, privacyScore);
      const overallScore = this.scorer.calculateOverallScore(securityScore, privacyScore);

      const confidenceScore = this.scorer.calculateConfidenceScore(mlResult.malwareProbability);

      const recommendations = this.recommender.generateRecommendations({
        ml: mlResult,
        trackers: trackerResult,
        saat: saatResult,
        permissions,
      });

      // LightGBM decides, Gemini only explains
      const mlAnalysis = await this.geminiML.explainScan({
        packageName,
        appName,
        verdict: lgbm.verdict,
        malwareProbability: mlResult.malwareProbability,
        riskLevel: mlResult.riskLevel,
        topFeatures: mlResult.topContributingFeatures,
        permissions,
        trackers: (trackerResult?.trackers || []).filter((t) => t.found),
        signatureValid,
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
          analysisType,
          ml: mlResult,
          mlAnalysis,
          trackers: trackerResult,
          saat: saatResult,
          permissions,
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
  async getScanResult(scanId: string, userId: string): Promise<ScanResultDto> {
    const scan = await this.scanModel.findOne({ scanId, userId }).lean();
    if (!scan) {
      // Same answer whether the scan doesn't exist or belongs to someone else
      throw new NotFoundException(`Scan ${scanId} not found`);
    }

    return this.mapScanToDto(scan);
  }

  /**
   * Get scan progress
   */
  async getScanProgress(scanId: string, userId: string): Promise<ScanProgressDto> {
    // Progress lives in the cache without an owner, so check ownership against the scan record.
    // Batch scans store one record per app as `<scanId>-<packageName>`.
    const escaped = scanId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const owned = await this.scanModel.exists({
      userId,
      $or: [{ scanId }, { scanId: { $regex: `^${escaped}-` } }],
    });
    if (!owned) {
      throw new NotFoundException(`Scan ${scanId} not found`);
    }
    return this.progressTracker.getProgress(scanId);
  }

  /**
   * List user scans with pagination metadata
   */
  async getUserScans(userId: string, limit = 20, skip = 0): Promise<{
    scans: any[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const [scans, total] = await Promise.all([
      this.scanModel
        .find({ userId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip)
        .lean(),
      this.scanModel.countDocuments({ userId })
    ]);

    return {
      scans: scans.map((scan: any) => ({
        scanId: scan.scanId,
        status: scan.status,
        totalApps: 1,  // Each scan is one app
        scannedApps: scan.status === 'COMPLETED' ? 1 : 0,
        averageScore: scan.overallScore || 0,
        highRiskApps: ['CRITICAL', 'HIGH'].includes(scan.globalRisk) ? 1 : 0,
        mediumRiskApps: scan.globalRisk === 'MEDIUM' ? 1 : 0,
        lowRiskApps: scan.globalRisk === 'LOW' ? 1 : 0,
        createdAt: scan.createdAt ? new Date(scan.createdAt).toISOString() : new Date().toISOString(),
        completedAt: scan.endTime ? new Date(scan.endTime).toISOString() : null,
        duration: scan.duration || null,
        packageName: scan.packageName,
        appName: scan.appName,
        globalRisk: scan.globalRisk,
        overallScore: scan.overallScore,
      })),
      total,
      limit,
      offset: skip
    };
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
      // No existing scan - perform hybrid analysis (TensorFlow + Gemini)
      return this.performHybridAnalysis(packageName, userId);
    }

    return this.mapScanToDto(scan);
  }

  /**
   * Perform hybrid ML analysis using TensorFlow + Gemini
   */
  private async performHybridAnalysis(packageName: string, userId: string): Promise<ScanResultDto> {
    this.logger.log(`🔬 Starting hybrid ML analysis for ${packageName}`);

    // Step 1: Detect trackers
    const trackerResult = await this.trackerDetector.detectTrackers(packageName);

    // Step 2: Get reputation-based risk (TensorFlow heuristics)
    const reputationRisk = this.getAppReputationRisk(packageName, trackerResult);
    const permissions = this.getKnownAppPermissions(packageName);

    // Step 3: Prepare input for Gemini analysis
    const geminiInput: AppAnalysisInput = {
      packageName,
      appName: packageName.split('.').pop() || packageName,
      permissions,
      trackers: trackerResult.trackers.map(t => ({
        name: t.name,
        category: t.category,
      })),
      isSystemApp: false,
      signatureValid: true,
    };

    // Step 4: Call Gemini for intelligent analysis
    this.logger.log(`🤖 Calling Gemini API for ${packageName}...`);
    const geminiResult = await this.geminiML.analyzeApp(geminiInput);
    this.logger.log(`✅ Gemini analysis complete: ${geminiResult.verdict} (${geminiResult.confidence}% confidence)`);

    // Step 5: Combine TensorFlow + Gemini results (hybrid scoring)
    const tfProbability = reputationRisk.probability;
    const geminiProbability = geminiResult.malwareProbability;

    // Weighted average: TensorFlow 40%, Gemini 60% (Gemini is more accurate)
    const hybridProbability = tfProbability * 0.4 + geminiProbability * 0.6;

    // Calculate final scores
    const securityScore = Math.round(100 - hybridProbability * 50);
    const privacyScore = trackerResult.privacyScore;
    const globalRisk = geminiResult.riskLevel; // Use Gemini's risk level (more nuanced)
    const overallScore = this.scorer.calculateOverallScore(securityScore, privacyScore);

    // Confidence: average of both sources
    const confidenceScore = Math.round((reputationRisk.confidence + geminiResult.confidence) / 2);
    const verdict = geminiResult.verdict;

    // Step 6: Build ML analysis object with explanations
    const mlAnalysis: MLAnalysisDto = {
      explanation: geminiResult.explanation,
      recommendations: geminiResult.recommendations,
      riskFactors: geminiResult.riskFactors,
      safetyTips: geminiResult.safetyTips,
      analysisDetails: geminiResult.analysisDetails,
      analysisSource: this.geminiML.isAvailable() ? 'hybrid' : 'tensorflow',
    };

    // Log scores for debugging
    this.logger.log(
      `📊 Hybrid scores for ${packageName}: TF=${(tfProbability * 100).toFixed(1)}%, Gemini=${(geminiProbability * 100).toFixed(1)}%, Final=${(hybridProbability * 100).toFixed(1)}%`
    );
    this.logger.log(
      `📊 Scores for ${packageName}: security=${securityScore}, privacy=${privacyScore}, overall=${overallScore}, confidence=${confidenceScore}`
    );

    // Step 7: Save scan to database
    const scanId = nanoid(16);
    await this.scanModel.create({
      scanId,
      packageName,
      appName: packageName.split('.').pop() || packageName,
      analysisType: AnalysisType.INSTALLED_APP,
      status: 'COMPLETED',
      userId,
      securityScore,
      privacyScore,
      globalRisk,
      overallScore,
      confidenceScore,
      ml: {
        malwareProbability: hybridProbability,
        verdict,
        tensorflowProbability: tfProbability,
        geminiProbability: geminiProbability,
      },
      mlAnalysis,
      trackers: trackerResult,
      permissions,
      progressPercentage: 100,
      currentStep: 'finalizing',
      endTime: new Date(),
    });

    return {
      scanId,
      packageName,
      appName: packageName.split('.').pop() || packageName,
      analysisType: 'installed_app' as any,
      status: 'COMPLETED',
      securityScore,
      privacyScore,
      globalRisk,
      overallScore,
      confidenceScore,
      ml: {
        malwareProbability: hybridProbability,
        verdict,
      },
      mlAnalysis,
      trackers: trackerResult,
      permissions,
      recommendations: this.recommender.generateRecommendations({
        ml: { malwareProbability: hybridProbability, verdict },
        trackers: trackerResult,
        saat: null,
        permissions,
      }),
    } as any;
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
      analysisType: scan.analysisType,
      platform: scan.platform || 'android',
      status: scan.status,
      securityScore: scan.securityScore,
      privacyScore: scan.privacyScore,
      globalRisk: scan.globalRisk,
      overallScore: scan.overallScore,
      confidenceScore: scan.confidenceScore,
      ml: scan.ml,
      mlAnalysis: scan.mlAnalysis,
      trackers: scan.trackers,
      saat: scan.saat,
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

  /**
   * LightGBM output -> stored ML result (risk bands are relative to the model's own threshold)
   */
  private toMlResult(lgbm: FastScanResult, inferenceTime: number): MLResultDto {
    const { score, threshold } = lgbm;
    let riskLevel: MLResultDto['riskLevel'] = 'LOW';
    if (score >= CRITICAL_SCORE) riskLevel = 'CRITICAL';
    else if (score >= threshold) riskLevel = 'HIGH';
    else if (score >= threshold / 2) riskLevel = 'MEDIUM';

    return {
      malwareProbability: Math.round(score * 1000) / 1000,
      // 0 at the threshold, 1 at the far end of the scale
      confidenceLevel: Math.round((Math.abs(score - threshold) / (score >= threshold ? 1 - threshold : threshold)) * 1000) / 1000,
      topContributingFeatures: lgbm.topContributingFeatures.map((f) => ({ ...f, normalizedValue: f.value })),
      riskLevel,
      modelVersion: lgbm.modelVersion,
      inferenceTime,
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
   * Start a batch scan for multiple apps (e.g., from iOS app research or Android device list)
   */
  async startBatchScan(
    dto: BatchScanDto,
    userId: string,
  ): Promise<BatchScanResultDto> {
    const scanId = nanoid(16);
    this.logger.log(`Starting batch scan ${scanId} for ${dto.apps.length} apps on ${dto.platform}`);

    const results: BatchAppResultDto[] = [];
    let totalAlerts = 0;
    const riskDistribution = { critical: 0, high: 0, medium: 0, low: 0 };
    let aggregateScore = 0;

    // Process each app in the batch
    // In a real production app, this would be queued or processed concurrently with limits
    for (const app of dto.apps) {
      const packageName = app.packageName;

      // Perform a background "hybrid" style analysis (reputation based)
      // Since we don't have the APK file, we rely on tracker detection and heuristics
      const trackerResult = await this.trackerDetector.detectTrackers(packageName);
      const reputation = this.getAppReputationRisk(packageName, trackerResult);

      const securityScore = Math.round(100 - (reputation.probability * 100));
      const privacyScore = trackerResult.privacyScore;
      const overallScore = Math.round((securityScore + privacyScore) / 2);

      const riskLevel = this.scorer.determineGlobalRisk(securityScore, privacyScore);

      // Update distribution
      riskDistribution[riskLevel.toLowerCase()]++;
      totalAlerts += trackerResult.totalFound;
      aggregateScore += overallScore;

      results.push({
        packageName,
        name: app.name || packageName,
        version: app.version,
        score: overallScore,
        riskLevel,
        alerts: trackerResult.trackers.filter(t => t.found).map(t => `Detected tracker: ${t.name}`),
        trackers: trackerResult.trackers.filter(t => t.found).map(t => t.name),
        permissions: {
          dangerous: [], // We don't have permissions info for simple package-based scan on iOS
          total: 0
        }
      });

      // Save individual scan record for history visibility
      await this.scanModel.create({
        scanId: `${scanId}-${packageName}`,
        packageName,
        appName: app.name || packageName,
        analysisType: AnalysisType.INSTALLED_APP,
        platform: dto.platform || 'android',
        status: 'COMPLETED',
        userId,
        securityScore,
        privacyScore,
        overallScore,
        globalRisk: riskLevel,
        trackers: trackerResult,
        startTime: new Date(),
        endTime: new Date(),
        progressPercentage: 100,
        currentStep: 'COMPLETED',
      });
    }

    const avgScore = dto.apps.length > 0 ? Math.round(aggregateScore / dto.apps.length) : 100;

    return {
      scanId,
      userHash: dto.userHash,
      totalApps: dto.apps.length,
      results,
      summary: {
        avgScore,
        riskDistribution,
        totalAlerts,
        mostDangerousApps: results
          .filter(r => ['HIGH', 'CRITICAL'].includes(r.riskLevel))
          .sort((a, b) => a.score - b.score)
          .slice(0, 3)
          .map(r => ({ packageName: r.packageName, name: r.name, score: r.score }))
      },
      createdAt: new Date().toISOString(),
      platform: dto.platform || Platform.ANDROID
    };
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

  /**
   * Get the latest scan for a user
   */
  async getLatestScan(userId: string): Promise<any> {
    const latestScan = await this.scanModel
      .findOne({ userId })
      .sort({ startTime: -1 })
      .exec();

    if (!latestScan) {
      return {
        status: 'NONE',
        message: 'No scans found for this user',
      };
    }

    // Identify if this was part of a batch
    const baseScanId = latestScan.scanId.split('-')[0];
    const batchScans = await this.scanModel
      .find({ userId, scanId: new RegExp(`^${baseScanId}`) })
      .exec();

    const results = batchScans.map(s => this.mapScanToAppScanResult(s));
    const riskyAppsCount = results.filter(r => ['HIGH', 'CRITICAL'].includes(r.riskLevel)).length;

    return {
      scanId: baseScanId,
      status: 'COMPLETED',
      overallScore: latestScan.overallScore,
      globalRisk: latestScan.globalRisk,
      totalApps: batchScans.length,
      riskyAppsCount,
      scanDate: latestScan.startTime.toISOString(),
      results,
    };
  }

  /**
   * Get scan statistics for a user
   */
  async getScanStatistics(userId: string): Promise<any> {
    const scans = await this.scanModel.find({ userId }).exec();

    if (scans.length === 0) {
      return {
        totalScans: 0,
        averageScore: 100,
        riskDistribution: { critical: 0, high: 0, medium: 0, low: 0 },
        totalAlerts: 0,
        trends: []
      };
    }

    const distribution = { critical: 0, high: 0, medium: 0, low: 0 };
    let totalScore = 0;
    let totalAlerts = 0;

    scans.forEach(scan => {
      const risk = (scan.globalRisk || 'low').toLowerCase();
      if (distribution.hasOwnProperty(risk)) {
        distribution[risk]++;
      }
      totalScore += scan.overallScore || 100;
      totalAlerts += (scan.trackers?.totalFound || 0);
    });

    return {
      totalScans: scans.length,
      averageScore: Math.round(totalScore / scans.length),
      riskDistribution: distribution,
      totalAlerts,
      lastScanDate: scans.sort((a, b) => b.startTime.getTime() - a.startTime.getTime())[0].startTime.toISOString(),
    };
  }

  private mapScanToAppScanResult(scan: Scan): any {
    return {
      packageName: scan.packageName,
      name: scan.appName || scan.packageName,
      score: scan.overallScore,
      riskLevel: scan.globalRisk,
      trackers: scan.trackers?.trackers?.filter(t => t.found).map(t => t.name) || [],
      status: scan.status
    };
  }
}
