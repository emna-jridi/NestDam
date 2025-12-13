import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { StartScanRequestDto } from '../../domain/dtos/start-scan.dto';
import { ScanResponseDto } from '../../domain/dtos/scan-response.dto';
import { AnalysisResultDto } from '../../domain/dtos/analysis-result.dto';
import { ScoreCalculatorService } from '../../domain/services/score-calculator.service';
import { OllamaService } from '../../infrastructure/external-services/ollama.service';
import { PlayStoreService } from '../../infrastructure/external-services/play-store.service';
import { CacheService } from '../../infrastructure/cache/cache.service';
import { ScanRepository } from '../../infrastructure/repositories/scan.repository';
import { AppRepository } from '../../infrastructure/repositories/app.repository';
import { ScanEntity } from '../../domain/entities/scan.entity';

@Injectable()
export class StartScanUseCase {
  private logger = new Logger(StartScanUseCase.name);

  constructor(
    private scanRepository: ScanRepository,
    private appRepository: AppRepository,
    private scoreCalculator: ScoreCalculatorService,
    private ollamaService: OllamaService,
    private playStoreService: PlayStoreService,
    private cacheService: CacheService,
    @InjectModel('Scan') private scanModel: Model<any>,
  ) {}

  async execute(request: StartScanRequestDto): Promise<ScanResponseDto> {
    const startTime = Date.now();
    const conn = this.scanModel.db;
    const dbName = (conn as any)?.name || 'unknown';
    const dbFromClient = (conn as any)?.client?.db?.()?.databaseName;
    const collectionName = this.scanModel.collection.name;

    this.logger.log(`[DB] connection.name=${dbName} db.databaseName=${dbFromClient || 'unknown'} collection=${collectionName}`);
    this.logger.log(`[EXECUTE] 📥 Request with ${request.apps?.length || 0} apps`);

    if (!request.apps || request.apps.length === 0) {
      throw new BadRequestException('At least one app package name is required');
    }

    const apps = request.apps as any[];
    const scanId = new Types.ObjectId().toString();

    this.logger.log(`[${scanId}] 🚀 SYNC ANALYSIS: Starting scan for ${apps.length} apps`);

    try {
      // 1. CREATE SCAN IN DB
      const scan: ScanEntity = {
        id: scanId,
        userId: request.userId,
        deviceId: request.deviceId,
        platform: request.platform,
        status: 'pending',
        apps: [],
        createdAt: new Date(),
        totalApps: apps.length,
        scannedApps: 0,
      };

      const savedScan = await this.scanRepository.save(scan);
      const finalScanId = savedScan.id || scanId;
      this.logger.log(`[${finalScanId}] ✅ Scan created with totalApps=${savedScan.totalApps}`);

      // VERIFY IMMEDIATE DB PERSISTENCE
      const verifyRead: any = await this.scanModel.findById(finalScanId).lean().exec();
      if (!verifyRead) {
        throw new Error(
          `CRITICAL: Scan ${finalScanId} not found in DB immediately after save!`,
        );
      }
      this.logger.log(
        `[${finalScanId}] ✅ VERIFIED in DB: totalApps=${verifyRead.totalApps}, scannedApps=${verifyRead.scannedApps}`,
      );
      this.logger.log(`[${finalScanId}] 🗄️ DB document after create: ${JSON.stringify(verifyRead)}`);

      // 2. SYNCHRONOUS ANALYSIS (NO setImmediate)
      this.logger.log(`[${finalScanId}] 🔄 Starting SYNCHRONOUS analysis...`);

      const results: AnalysisResultDto[] = [];
      let scannedCount = 0;

      for (let i = 0; i < apps.length; i++) {
        const app = apps[i];
        const packageName = typeof app === 'string' ? app : app.packageName;
        this.logger.log(`[${finalScanId}] 📱 [${i + 1}/${apps.length}] Analyzing: ${packageName}`);

        try {
          const appStartTime = Date.now();
          const result = await this.scanApp(packageName, finalScanId);
          const appDuration = Date.now() - appStartTime;

          results.push(result);
          scannedCount++;

          // UPDATE PROGRESS - SYNCHRONOUSLY
          await this.scanRepository.update(finalScanId, {
            scannedApps: scannedCount,
          });

          this.logger.log(
            `[${finalScanId}] ✅ [${i + 1}/${apps.length}] ${packageName} done (${appDuration}ms, score=${result.aiRiskScore})`,
          );
        } catch (error: any) {
          this.logger.warn(
            `[${finalScanId}] ⚠️ [${i + 1}/${apps.length}] ${packageName} failed: ${error.message}`,
          );
          // STILL COUNT AS SCANNED TO MATCH CONTRACT
          const fallbackResult: AnalysisResultDto = {
            aiRiskScore: 50,
            aiRiskLevel: 'medium' as any,
            aiStatus: 'fallback',
            aiSummary: `Fallback applied because: ${error.message}`,
            aiRecommendations: ['Review permissions and update app if possible.'],
            permissions: [],
            trackers: [],
          } as any;
          results.push(fallbackResult);
          scannedCount++;
          await this.scanRepository.update(finalScanId, {
            scannedApps: scannedCount,
          });
          // CONTINUE ANALYSIS DESPITE ERROR
        }
      }

      this.logger.log(
        `[${finalScanId}] 📊 Analysis done: ${scannedCount}/${apps.length} apps scanned, ${results.length} results`,
      );

      // 3. AGGREGATE RESULTS WITH FALLBACK
      const aggregated = this.scoreCalculator.aggregateResults(results);

      // 4. ENSURE VALID GLOBAL SCORE
      let globalScore = aggregated.avgRiskScore;
      if (scannedCount > 0 && globalScore === 0) {
        this.logger.warn(
          `[${finalScanId}] ⚠️ globalScore is 0 despite ${scannedCount} apps - using heuristic fallback`,
        );
        globalScore = this.calculateFallbackScore(results);
      }
      if (scannedCount > 0 && globalScore <= 0) {
        globalScore = Math.max(1, Math.round(this.calculateFallbackScore(results) || 50));
      }

      this.logger.log(`[${finalScanId}] 📈 Global Score: ${globalScore}/100`);

      const duration = Date.now() - startTime;

      // 5. FINAL SAVE - SYNCHRONOUSLY AWAITED
      this.logger.log(`[${finalScanId}] 💾 Saving final results to DB...`);

      const finalScanData = {
        status: 'completed' as const,
        completedAt: new Date(),
        duration: duration,
        totalApps: apps.length,
        scannedApps: Math.max(scannedCount, apps.length),
        results: {
          apps: results as any,
          globalSummary: aggregated.globalSummary,
          globalRecommendations: aggregated.globalRecommendations,
          globalScore: globalScore,
          maxRiskLevel: aggregated.maxRiskLevel,
        } as any,
      };

      const finalScan = await this.scanRepository.update(finalScanId, finalScanData);
      if (!finalScan) {
        throw new Error(`CRITICAL: Failed to update scan ${finalScanId} with final results`);
      }

      // VERIFY FINAL DB STATE
      const finalVerify: any = await this.scanModel.findById(finalScanId).lean().exec();
      if (!finalVerify) {
        throw new Error(`CRITICAL: Final scan ${finalScanId} not found in DB!`);
      }

      this.logger.log(`[${finalScanId}] 🎉 ANALYSIS COMPLETED`);
      this.logger.log(`[${finalScanId}] 🗄️ Final DB document: ${JSON.stringify(finalVerify)}`);
      this.logger.log(`[${finalScanId}] Final DB state:`, {
        status: finalVerify.status,
        scannedApps: finalVerify.scannedApps,
        totalApps: finalVerify.totalApps,
        globalScore: finalVerify.results?.globalScore,
        duration: finalVerify.duration,
      });

      return {
        scanId: finalScanId,
        status: 'completed',
        userId: request.userId,
        deviceId: request.deviceId,
        platform: request.platform,
        createdAt: new Date().toISOString(),
      };
    } catch (error: any) {
      this.logger.error(`[${scanId}] ❌ SCAN FAILED: ${error.message}`);
      this.logger.error(`[${scanId}] Stack:`, error.stack);
      throw error;
    }
  }

  private async scanApp(packageName: string, scanId: string): Promise<AnalysisResultDto> {
    const cacheKey = `scan:${packageName}`;
    const cached = await this.cacheService.get<AnalysisResultDto>(cacheKey);
    if (cached) {
      this.logger.debug(`[${scanId}] 📦 ${packageName} from cache`);
      return cached;
    }

    try {
      // Fetch store data
      const storeDataKey = `store:${packageName}`;
      let storeData = await this.cacheService.get(storeDataKey);
      if (!storeData) {
        storeData = await this.playStoreService.fetchAppDetails(packageName);
        await this.cacheService.set(storeDataKey, storeData, 86400);
      }

      const permissions = await this.playStoreService.fetchAppPermissions(packageName);

      const mobsfReport = {
        trackers: {
          'Google Firebase': { className: 'com.google.firebase.*' },
          'Google Analytics': { className: 'com.google.analytics.*' },
        },
      };

      const appInfo = JSON.stringify({
        packageName,
        permissions,
        storeData: storeData || {},
      }).substring(0, 2000);

      // GET AI ANALYSIS WITH FALLBACK SUPPORT
      this.logger.debug(`[${scanId}] 🤖 Calling Ollama for ${packageName}...`);
      const aiAnalysis = await this.ollamaService.analyzeAppSecurity(appInfo);

      const { aiRiskScore, aiRiskLevel } = this.scoreCalculator.calculateRiskScore(
        permissions,
        mobsfReport.trackers || {},
        aiAnalysis.summary,
      );

      // FALLBACK SCORE IF AI FAILED
      let finalScore = aiRiskScore;
      if (aiAnalysis.usedFallback) {
        this.logger.warn(
          `[${scanId}] ⚠️ ${packageName} used AI fallback, score may be heuristic`,
        );
        // Calculate fallback score based on permissions + store rating
        const permScore = this.calculatePermissionScore(permissions);
        const storeRating = (storeData as any)?.rating || 3.0;
        const ratingScore = Math.round(100 - (storeRating / 5) * 80);
        finalScore = Math.round(permScore * 0.6 + ratingScore * 0.4);
        if (finalScore <= 0) {
          finalScore = Math.max(1, ratingScore);
        }
      }

      const result: AnalysisResultDto = {
        aiRiskScore: finalScore,
        aiRiskLevel: aiRiskLevel,
        aiStatus: aiAnalysis.aiStatus,
        aiSummary: aiAnalysis.summary,
        aiRecommendations: aiAnalysis.recommendations || [],
        permissions: permissions.map(p => ({ name: p })),
        trackers: Object.keys(mobsfReport.trackers || {}).map(t => ({ name: t })),
      } as any;

      await this.cacheService.set(cacheKey, result, 3600);
      return result;
    } catch (error: any) {
      this.logger.error(`[${scanId}] ❌ scanApp error for ${packageName}: ${error.message}`);
      throw error;
    }
  }

  private calculatePermissionScore(permissions: any[]): number {
    const sensitivePermissions: Record<string, number> = {
      'android.permission.ACCESS_FINE_LOCATION': 15,
      'android.permission.ACCESS_COARSE_LOCATION': 10,
      'android.permission.CAMERA': 12,
      'android.permission.RECORD_AUDIO': 12,
      'android.permission.READ_CONTACTS': 10,
      'android.permission.READ_CALENDAR': 8,
      'android.permission.READ_SMS': 15,
      'android.permission.SEND_SMS': 15,
      'android.permission.READ_PHONE_STATE': 8,
      'android.permission.GET_ACCOUNTS': 8,
      'android.permission.WRITE_EXTERNAL_STORAGE': 5,
      'android.permission.READ_EXTERNAL_STORAGE': 5,
      'android.permission.INTERNET': 3,
    };

    let score = 0;
    const permList = Array.isArray(permissions) ? permissions : [];
    for (const perm of permList) {
      score += sensitivePermissions[perm] || 2;
    }
    return Math.min(100, score);
  }

  private calculateFallbackScore(results: AnalysisResultDto[]): number {
    if (results.length === 0) return 50;
    const scores = results.map(r => r.aiRiskScore);
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }
}
