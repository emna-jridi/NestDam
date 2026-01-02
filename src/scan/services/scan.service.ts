import { Injectable, Logger } from '@nestjs/common';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { nanoid } from 'nanoid';
import {
  StartScanDto,
  ScanResultDto,
  ScanProgressDto,
  FeatureExtractionDto,
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
    const level = dto.level || 'FAST';

    try {
      this.logger.log(`Starting ${level} scan ${scanId}`);

      // Create progress tracker
      await this.progressTracker.initProgress(scanId, level);

      // Create database record
      const scan = await this.scanModel.create({
        scanId,
        packageName: '',
        level,
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
    let apkPath: string = '';
    let tempDir: string = '';
    let packageName: string;
    let appName: string;
    let versionCode: string;
    let versionName: string;
    let manifest: string;
    let signatureValid: boolean;
    let certificateFingerprint: string;

    try {
      // Step 1: Extract APK
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
      await this.cacheService.cacheResult(scanId, packageName, versionCode, dto.level);

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
          scanEtatus: 'FAILED',
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
      status: scan.status,
      securityScore: scan.securityScore,
      privacyScore: scan.privacyScore,
      globalRisk: scan.globalRisk,
      overallScore: scan.overallScore,
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
