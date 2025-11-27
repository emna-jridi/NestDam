import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

import { ExodusDetectorService } from './detectors/exodus-detector.service';
import { HeuristicDetectorService } from './detectors/heuristic-detector.service';
import { AiAnalyzerService } from './ai/ai-analyzer.service';
import { PlayStoreService } from '../play-store.service';
import {
  TrackerDetectionContext,
  TrackerDetectionResult,
  DeepAnalysisResult,
} from './interfaces/tracker-detection.interface';

@Injectable()
export class TrackerDetectionOrchestrator {
  private readonly logger = new Logger(TrackerDetectionOrchestrator.name);
  private readonly n8nWebhookUrl: string;

  constructor(
    private readonly exodusDetector: ExodusDetectorService,
    private readonly heuristicDetector: HeuristicDetectorService,
    private readonly aiAnalyzer: AiAnalyzerService,
    private readonly playStore: PlayStoreService,
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    this.n8nWebhookUrl =
      this.config.get<string>('N8N_WEBHOOK_URL') ||
      'http://localhost:5678/webhook/shadowguard-deep-analysis';
  }

  async detectBatch(
    contexts: TrackerDetectionContext[],
  ): Promise<TrackerDetectionResult[]> {
    this.logger.log(` Batch detection for ${contexts.length} apps`);
    const startTime = Date.now();
    const batchSize = 10;
    const results: TrackerDetectionResult[] = [];

    for (let i = 0; i < contexts.length; i += batchSize) {
      const batch = contexts.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((ctx) => this.detectSingleFast(ctx)),
      );
      results.push(...batchResults);
    }
    const totalTime = Date.now() - startTime;

    this.logger.log(
      ` Batch detection completed: ${contexts.length} apps in ${totalTime}ms (${Math.round(totalTime / contexts.length)}ms/app)`,
    );

    return results;
  }

  private async detectSingleFast(
    context: TrackerDetectionContext,
  ): Promise<TrackerDetectionResult> {
    const startTime = Date.now();

    try {
      const exodusTrackers = await this.exodusDetector.detectTrackers(
        context.packageName,
      );

      if (exodusTrackers.length > 0) {
        const confidence = 90;
        const needsDeepAnalysis = this.shouldDeepAnalyze(
          exodusTrackers.length,
          context.permissions?.length || 0,
        );

        return {
          trackers: exodusTrackers,
          method: 'exodus',
          confidence,
          processingTime: Date.now() - startTime,
          needsDeepAnalysis,
        };
      }
      const heuristicTrackers = await this.heuristicDetector.detectTrackers(
        context.packageName,
      );

      const confidence = 60;
      const needsDeepAnalysis = true; 

      return {
        trackers: heuristicTrackers,
        method: 'heuristic',
        confidence,
        processingTime: Date.now() - startTime,
        needsDeepAnalysis,
      };
    } catch (error) {
      this.logger.error(
        `Fast detection failed for ${context.packageName}: ${error.message}`,
      );

      return {
        trackers: [],
        method: 'heuristic',
        confidence: 0,
        processingTime: Date.now() - startTime,
        needsDeepAnalysis: true,
      };
    }
  }

  async triggerDeepAnalysis(
    context: TrackerDetectionContext,
    scanId: string,
  ): Promise<{ triggered: boolean; message: string }> {
    this.logger.log(
      `Triggering deep analysis for ${context.packageName} (scan: ${scanId})`,
    );

    try {
      let enrichedContext = { ...context };
      if (context.platform === 'android') {
        try {
          const playStoreData = await this.playStore.getAppDetails(
            context.packageName,
          );

          if (playStoreData) {
            enrichedContext = {
              ...enrichedContext,
              appName: playStoreData.name,
              category: playStoreData.category,
              installs: playStoreData.installs,
            };
          }
        } catch (error) {
          this.logger.debug(
            `Play Store lookup failed: ${error.message}`,
          );
        }
      }

      // Déclencher n8n workflow
      await firstValueFrom(
        this.http.post(
          this.n8nWebhookUrl,
          {
            scanId,
            context: enrichedContext,
          },
          { timeout: 5000 },
        ),
      );

      this.logger.log(
        `✅ Deep analysis triggered for ${context.packageName}`,
      );

      return {
        triggered: true,
        message: 'Deep analysis in progress. You will be notified when complete.',
      };
    } catch (error) {
      this.logger.error(
        `Failed to trigger deep analysis: ${error.message}`,
      );

      return {
        triggered: false,
        message: 'Failed to start deep analysis. Please try again.',
      };
    }
  }

  /**
   * ✅ MODE PROFOND : Analyse complète avec IA (appelé par n8n)
   */
  async analyzeDeep(
    context: TrackerDetectionContext,
  ): Promise<DeepAnalysisResult> {
    const startTime = Date.now();

    this.logger.log(`🤖 Deep AI analysis for ${context.packageName}`);

    try {
      // 1) Détection trackers avec IA
      const aiTrackers = await this.aiAnalyzer.detectTrackersFromPermissions(
        context,
      );

      // 2) Combiner avec Exodus si disponible
      const exodusTrackers = await this.exodusDetector.detectTrackers(
        context.packageName,
      );

      const allTrackers = this.mergeTrackers(exodusTrackers, aiTrackers);

      // 3) Analyse de risque avec IA
      const riskAnalysis = await this.aiAnalyzer.analyzeRisk(
        context,
        allTrackers,
      );

      // 4) Générer recommandations avec IA
      const recommendations = await this.aiAnalyzer.generateRecommendations(
        context,
        riskAnalysis.riskLevel,
        riskAnalysis.concerns,
      );

      const processingTime = Date.now() - startTime;

      this.logger.log(
        `✅ Deep analysis completed for ${context.packageName} in ${processingTime}ms`,
      );

      return {
        trackers: allTrackers,
        riskScore: riskAnalysis.riskScore,
        riskLevel: riskAnalysis.riskLevel as any,
        concerns: riskAnalysis.concerns,
        positivePoints: riskAnalysis.positivePoints,
        recommendations: recommendations.recommendations,
        shouldUninstall: recommendations.shouldUninstall,
        alternatives: recommendations.alternatives,
        confidence: this.calculateConfidence(exodusTrackers.length, aiTrackers.length),
        processingTime,
      };
    } catch (error) {
      this.logger.error(
        `Deep analysis failed for ${context.packageName}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Helper : Fusionner trackers Exodus + IA
   */
  private mergeTrackers(exodus: any[], ai: any[]): any[] {
    const merged = [...exodus];
    const existingNames = new Set(exodus.map((t) => t.name.toLowerCase()));

    for (const aiTracker of ai) {
      if (!existingNames.has(aiTracker.name.toLowerCase())) {
        merged.push(aiTracker);
      }
    }

    return merged;
  }

  /**
   * Helper : Calculer confiance globale
   */
  private calculateConfidence(exodusCount: number, aiCount: number): number {
    if (exodusCount > 0 && aiCount > 0) return 95; // Les deux sources concordent
    if (exodusCount > 0) return 90; // Exodus seul
    if (aiCount > 0) return 80; // IA seule
    return 60; // Heuristiques
  }

  /**
   * Helper : Déterminer si analyse profonde nécessaire
   */
  private shouldDeepAnalyze(
    trackerCount: number,
    permissionCount: number,
  ): boolean {
    // Score basique
    const score = 100 - trackerCount * 3 - permissionCount * 2;
    return score < 70; // Si score < 70 → recommander analyse profonde
  }
}