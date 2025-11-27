// src/scan/scan.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Scan } from './schemas/scan.schema';
import { InstalledAppDto } from './dto/installed-apps.dto';
import { TrackerDetectionOrchestrator } from '../external-apis/tracker-detection/tracker-detection.orchestrator';
import { TrackerDetectionContext } from '../external-apis/tracker-detection/interfaces/tracker-detection.interface';

@Injectable()
export class ScanService {
  private readonly logger = new Logger(ScanService.name);

  constructor(
    @InjectModel(Scan.name) private scanModel: Model<Scan>,
    private readonly trackerOrchestrator: TrackerDetectionOrchestrator,
  ) { }

  /**
   * ✅ MODE RAPIDE : Scan batch toutes les apps (3-5s)
   */
  async scanAllApps(
    userHash: string,
    apps: InstalledAppDto[],
    platform: 'android' | 'ios',
  ) {
    this.logger.log(
      `📱 Starting FAST scan for ${apps.length} apps (${platform})`,
    );

    // Préparer contextes
    const contexts: TrackerDetectionContext[] = apps.map((app) => ({
      packageName: app.packageName,
      platform,
      permissions: app.permissions,
      appName: app.name,
    }));

    // Détection batch rapide
    const results = await this.trackerOrchestrator.detectBatch(contexts);

    // Construire résultats enrichis
    const analyzedApps = apps.map((app, index) => {
      const result = results[index];
      const basicScore = this.calculateBasicScore(
        result.trackers.length,
        app.permissions?.length || 0,
      );

      return {
        packageName: app.packageName,
        name: app.name,
        version: app.version,
        trackers: result.trackers.map((t) => t.name),
        trackerCount: result.trackers.length,
        detectionMethod: result.method,
        confidence: result.confidence,
        riskScore: basicScore,
        riskLevel: this.getRiskLevel(basicScore),
        needsDeepAnalysis: result.needsDeepAnalysis,
        processingTime: result.processingTime,
      };
    });

    // Sauvegarder scan
    const scan = await this.scanModel.create({
      userHash,
      platform,
      totalApps: apps.length,
      analyzedApps,
      status: 'completed', // Scan rapide terminé
      scannedAt: new Date(),
    });

    this.logger.log(`✅ Fast scan completed: ${scan._id}`);

    return {
      scanId: scan._id,
      userHash,
      platform,
      totalApps: apps.length,
      status: 'completed',
      message: 'Quick scan completed successfully',
      analyzedApps,
      stats: {
        highRisk: analyzedApps.filter((a) => a.riskLevel === 'HIGH' || a.riskLevel === 'CRITICAL').length,
        needDeepAnalysis: analyzedApps.filter((a) => a.needsDeepAnalysis).length,
      },
      scannedAt: scan.createdAt,
    };
  }

  /**
   * ✅ MODE PROFOND : Déclencher analyse approfondie 1 app (async)
   */
  async deepAnalyzeApp(
    userHash: string,
    app: InstalledAppDto,
    platform: 'android' | 'ios',
  ) {
    this.logger.log(`🔬 Starting DEEP analysis for ${app.packageName}`);

    // Créer scan avec status "analyzing"
    const scan = await this.scanModel.create({
      userHash,
      platform,
      totalApps: 1,
      analyzedApps: [
        {
          packageName: app.packageName,
          name: app.name,
          version: app.version,
        },
      ],
      status: 'analyzing',
      scannedAt: new Date(),
    });

    // Préparer contexte
    const context: TrackerDetectionContext = {
      packageName: app.packageName,
      platform,
      permissions: app.permissions,
      appName: app.name,
    };

    // Déclencher n8n (asynchrone)
    const triggerResult = await this.trackerOrchestrator.triggerDeepAnalysis(
      context,
      (scan._id as any).toString(),
    );

    return {
      scanId: scan._id,
      userHash,
      platform,
      packageName: app.packageName,
      status: 'analyzing',
      message: triggerResult.message,
      triggered: triggerResult.triggered,
      scannedAt: scan.createdAt,
    };
  }

  /**
   * ✅ Recevoir résultat analyse profonde depuis n8n
   */
  async receiveDeepAnalysisResult(scanId: string, result: any) {
    this.logger.log(`📥 Receiving deep analysis result for scan ${scanId}`);

    try {
      await this.scanModel.findByIdAndUpdate(scanId, {
        $set: {
          deepAnalysisResult: result,
          status: 'completed',
          analyzedAt: new Date(),
        },
      });

      this.logger.log(`✅ Deep analysis result saved for scan ${scanId}`);

      // TODO: Envoyer push notification au mobile

      return { success: true };
    } catch (error) {
      this.logger.error(
        `Failed to save deep analysis result: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Helper : Score basique rapide
   */
  private calculateBasicScore(
    trackerCount: number,
    permissionCount: number,
  ): number {
    let score = 100;
    score -= trackerCount * 4;
    score -= permissionCount * 2;
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Helper : Niveau de risque
   */
  private getRiskLevel(score: number): string {
    if (score >= 70) return 'LOW';
    if (score >= 50) return 'MEDIUM';
    if (score >= 30) return 'HIGH';
    return 'CRITICAL';
  }

  /**
   * ✅ Obtenir un scan par ID
   */
  async getScanById(scanId: string) {
    try {
      return await this.scanModel.findById(scanId).exec();
    } catch (error) {
      this.logger.error(`Failed to get scan ${scanId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * ✅ Obtenir le dernier scan d'un utilisateur
   */
  async getLatestScan(userHash: string) {
    try {
      return await this.scanModel
        .findOne({ userHash })
        .sort({ scannedAt: -1 })
        .exec();
    } catch (error) {
      this.logger.error(
        `Failed to get latest scan for ${userHash}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * ✅ Obtenir tous les scans d'un utilisateur avec pagination
   */
  async getUserScans(
    userHash: string,
    options: { limit?: number; skip?: number } = {},
  ) {
    try {
      const { limit = 10, skip = 0 } = options;

      const scans = await this.scanModel
        .find({ userHash })
        .sort({ scannedAt: -1 })
        .limit(limit)
        .skip(skip)
        .exec();

      const total = await this.scanModel.countDocuments({ userHash });

      return {
        scans,
        total,
        limit,
        skip,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get user scans for ${userHash}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * ✅ Supprimer un scan
   */
  async deleteScan(scanId: string, userHash: string) {
    try {
      const result = await this.scanModel
        .findOneAndDelete({ _id: scanId, userHash })
        .exec();

      if (!result) {
        throw new Error('Scan not found or unauthorized');
      }

      this.logger.log(`Scan ${scanId} deleted successfully`);
    } catch (error) {
      this.logger.error(`Failed to delete scan ${scanId}: ${error.message}`);
      throw error;
    }
  }



}