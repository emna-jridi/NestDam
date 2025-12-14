import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Types, Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { ScanRepository } from '../../infrastructure/repositories/scan.repository';
import { AppRepository } from '../../infrastructure/repositories/app.repository';
import { OllamaService } from '../../infrastructure/external-services/ollama.service';
import { PlayStoreService } from '../../infrastructure/external-services/play-store.service';
import { CacheService } from '../../infrastructure/cache/cache.service';
import { ScoreCalculatorService } from './score-calculator.service';
import { StartScanRequestDto } from '../dtos/start-scan.dto';
import { ScanResponseDto, ScanStatusResponseDto, ScanResultsSummaryDto } from '../dtos/scan-response.dto';
import { SearchAppRequestDto, SearchAppResponseDto, SearchResultDto, ScanHistoryResponseDto, ScanHistoryItemDto } from '../dtos/search-app.dto';
import { AppDto, AppDetailsResponseDto } from '../dtos/app.dto';
import { ScanEntity } from '../entities/scan.entity';
import { MobSFService } from '../../infrastructure/external-services/mobsf.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ScanService {
  private logger = new Logger(ScanService.name);

  constructor(
    private scanRepository: ScanRepository,
    private appRepository: AppRepository,
    private ollamaService: OllamaService,
    private playStoreService: PlayStoreService,
    private cacheService: CacheService,
    private scoreCalculator: ScoreCalculatorService,
    private mobsfService: MobSFService,
    @InjectModel('Scan') private scanModel: Model<any>,
  ) {}

  /**
   * Start a new scan - returns immediately with scanId
   * Analysis runs in background (fire & forget)
   */
  async startScan(request: StartScanRequestDto): Promise<ScanResponseDto> {
    const conn = this.scanModel.db;
    const dbName = (conn as any)?.name || 'unknown';
    const dbFromClient = (conn as any)?.client?.db?.()?.databaseName;
    const collectionName = this.scanModel.collection.name;

    const scanId = new Types.ObjectId().toString();
    const now = new Date();

    this.logger.log(`[DB] connection.name=${dbName} db.databaseName=${dbFromClient || 'unknown'} collection=${collectionName}`);
    this.logger.log(`[${scanId}] Starting SYNCHRONOUS scan for ${request.apps.length} apps`);

    // Create scan in DB with 'pending' status
    const scan: ScanEntity = {
      id: scanId,
      userId: request.userId,
      deviceId: request.deviceId,
      platform: request.platform,
      status: 'pending',
      totalApps: request.apps.length,
      scannedApps: 0,
      apps: [],
      createdAt: now,
    };

    const savedScan = await this.scanRepository.save(scan);
    const finalScanId = savedScan.id || scanId;
    const verifyCreate = await this.scanModel.findById(finalScanId).lean().exec();
    if (!verifyCreate) {
      throw new Error(`CRITICAL: Scan ${finalScanId} not found right after save`);
    }
    this.logger.log(`[${finalScanId}] ✅ Created & verified: ${JSON.stringify(verifyCreate)}`);

    // Mark analyzing
    await this.scanRepository.update(finalScanId, { status: 'analyzing' });

    const analyzedApps: any[] = [];
    let scannedCount = 0;
    const startTime = Date.now();

    for (let i = 0; i < request.apps.length; i++) {
      const appInfo = request.apps[i];
      this.logger.log(`[${finalScanId}] 📱 [${i + 1}/${request.apps.length}] ${appInfo.packageName}`);

      try {
        const appResult = await this.analyzeApp(appInfo.packageName, appInfo.displayName);
        analyzedApps.push(appResult);
        scannedCount++;
        await this.scanRepository.update(finalScanId, { scannedApps: scannedCount });
      } catch (error: any) {
        this.logger.warn(`[${finalScanId}] ⚠️ ${appInfo.packageName} failed: ${error.message}`);
        // still count to keep contract aligned; ensure all required fields are present
        analyzedApps.push({
          packageName: appInfo.packageName,
          appName: appInfo.displayName || appInfo.packageName,
          finalScore: { score: 50, storeWeight: 30, ollamaWeight: 70, breakdown: 'Fallback score' },
          scanResults: {
            aiRiskScore: 50,
            aiRiskLevel: 'medium',
            aiSummary: `Fallback: ${error.message}`,
            aiRecommendations: ['Retry scan later'],
            permissions: [],
            trackers: [],
          },
        } as any);
        scannedCount++;
        await this.scanRepository.update(finalScanId, { scannedApps: scannedCount });
      }
    }

    // Aggregate global score (ensure > 0)
    const scores = analyzedApps.map(app => {
      const fs = app.finalScore;
      if (typeof fs === 'object' && 'score' in fs) return (fs as any).score as number;
      if (typeof fs === 'number') return fs;
      return 0;
    });
    const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const globalScore = Math.max(1, avg || 50);

    const duration = Date.now() - startTime;

    const finalUpdate = await this.scanRepository.update(finalScanId, {
      status: 'completed',
      completedAt: new Date(),
      duration,
      totalApps: request.apps.length,
      scannedApps: Math.max(scannedCount, request.apps.length),
      apps: analyzedApps,
      results: {
        globalScore,
      } as any,
    });

    if (!finalUpdate) {
      throw new Error(`CRITICAL: Failed to persist final scan ${finalScanId}`);
    }

    const finalDoc = await this.scanModel.findById(finalScanId).lean().exec();
    if (!finalDoc) {
      throw new Error(`CRITICAL: Final scan ${finalScanId} not found in DB`);
    }
    this.logger.log(`[${finalScanId}] 🗄️ Final DB document: ${JSON.stringify(finalDoc)}`);

    return {
      scanId: finalScanId,
      status: 'completed',
      userId: request.userId,
      deviceId: request.deviceId,
      platform: request.platform,
      createdAt: now.toISOString(),
    };
  }

  /**
   * Get scan status with progress and results
   */
  async getScanStatus(scanId: string): Promise<ScanStatusResponseDto> {
    const scan = await this.scanRepository.findById(scanId);
    if (!scan) {
      throw new NotFoundException(`Scan with ID ${scanId} not found`);
    }

    // Base response
    const response: ScanStatusResponseDto = {
      scanId: scan.id || scanId,
      status: scan.status as 'pending' | 'analyzing' | 'completed' | 'failed',
      totalApps: scan.totalApps || 0,
      scannedApps: scan.scannedApps || 0,
    };

    // Calculate progress percentage
    if (scan.totalApps && scan.totalApps > 0) {
      response.progress = Math.round((scan.scannedApps || 0) / scan.totalApps * 100);
    } else {
      response.progress = scan.status === 'completed' ? 100 : 0;
    }

    // If completed, include results summary
    if (scan.status === 'completed') {
      response.progress = 100;
      response.results = await this.calculateScanResults(scanId);
    }

    return response;
  }

  /**
   * Get scan history for a user
   */
  async getScanHistory(userId: string, limit: number = 10, offset: number = 0): Promise<ScanHistoryResponseDto> {
    const allScans = await this.scanRepository.findAll();
    
    // Filter by userId and sort by date DESC
    const userScans = allScans
      .filter(scan => scan.userId === userId)
      .sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });

    const total = userScans.length;
    const paginatedScans = userScans.slice(offset, offset + limit);

    const scans: ScanHistoryItemDto[] = await Promise.all(
      paginatedScans.map(async (scan) => {
        const results = scan.status === 'completed' 
          ? await this.calculateScanResults(scan.id || '')
          : undefined;

        return {
          scanId: scan.id || '',
          status: scan.status as 'pending' | 'analyzing' | 'completed' | 'failed',
          totalApps: scan.totalApps || 0,
          scannedApps: scan.scannedApps || 0,
          averageScore: results?.averageScore,
          highRiskApps: results?.highRiskApps,
          mediumRiskApps: results?.mediumRiskApps,
          lowRiskApps: results?.lowRiskApps,
          createdAt: scan.createdAt ? scan.createdAt.toISOString() : new Date().toISOString(),
          completedAt: scan.completedAt ? scan.completedAt.toISOString() : undefined,
          duration: scan.duration,
        };
      })
    );

    return {
      scans,
      total,
      limit,
      offset,
    };
  }

  /**
   * Run a static APK scan using MobSF + Ollama
   */
  async scanApk(params: { userId: string; deviceId?: string; filePath: string; originalName: string }): Promise<AppDto> {
    const { userId, deviceId, filePath, originalName } = params;

    if (!fs.existsSync(filePath)) {
      throw new Error('APK file missing on server');
    }

    const ext = path.extname(originalName || filePath).toLowerCase();
    if (ext !== '.apk') {
      throw new Error('Seuls les fichiers APK sont acceptés');
    }

    const stats = fs.statSync(filePath);
    const maxSize = 200 * 1024 * 1024; // 200MB safety
    if (stats.size > maxSize) {
      throw new Error('Taille APK trop grande (>200MB)');
    }

    const scanStart = Date.now();

    // 1) Upload to MobSF
    const upload = await this.mobsfService.uploadApp(filePath);

    // 2) Trigger static analysis
    await this.mobsfService.triggerScan(upload.md5, upload.scan_type);

    // 3) Fetch report JSON
    const report = await this.mobsfService.getScanReport(upload.md5, upload.scan_type);

    // Extract useful fields
    const packageName = (report.android_api?.package_name || report.android_api?.packageName || 'unknown.package') as string;
    const appName = (report.android_api?.app_name || report.android_api?.appName || originalName.replace(/\.apk$/i, '')) as string;
    const versionName = report.android_api?.version_name || report.android_api?.versionName;

    const permissionsObj = report.permissions || {};
    const permissions = Array.isArray(permissionsObj)
      ? permissionsObj
      : Object.keys(permissionsObj).filter(k => permissionsObj[k]);
    const dangerousPermissions = permissions.filter(p => {
      const meta = permissionsObj[p];
      return meta?.protection_level === 'dangerous' || meta?.level === 'dangerous';
    });

    const trackersList = Array.isArray(report.trackers)
      ? report.trackers.map((t: any) => t.name || t.title || t.id || 'tracker')
      : Object.keys(report.trackers || {});

    const exportedComponents = Array.isArray(report.exported_activities)
      ? report.exported_activities
      : Object.keys(report.android_api?.exported_components || {});

    const securityFindings = report.security_analysis || {};

    // 4) Build AI prompt payload
    const aiPayload = {
      packageName,
      appName,
      versionName,
      permissions,
      dangerousPermissions,
      trackers: trackersList,
      exportedComponents,
      findings: securityFindings,
    };

    const aiAnalysis = await this.ollamaService.analyzeAppSecurity(JSON.stringify(aiPayload));

    // 5) Fallback score if AI failed
    let finalScore = aiAnalysis.aiRiskScore;
    if (aiAnalysis.usedFallback) {
      const high = (securityFindings.high || securityFindings.critical || []).length || 0;
      const medium = (securityFindings.medium || []).length || 0;
      const low = (securityFindings.low || []).length || 0;
      const heuristic = Math.min(100, high * 20 + medium * 10 + low * 5 + trackersList.length * 5 + dangerousPermissions.length * 5);
      finalScore = heuristic || 50;
    }

    const { aiRiskLevel } = this.scoreCalculator.calculateRiskScore(
      permissionsObj,
      report.trackers || {},
      aiAnalysis.summary,
      finalScore,
    );

    // Persist scan in DB
    const scanDuration = Date.now() - scanStart;
    const scanRecord: ScanEntity = {
      id: new Types.ObjectId().toString(),
      userId,
      deviceId: deviceId || 'unknown-device',
      platform: 'android',
      status: 'completed',
      apps: [],
      totalApps: 1,
      scannedApps: 1,
      createdAt: new Date(),
      completedAt: new Date(),
      duration: scanDuration,
      results: {
        apps: [
          {
            packageName,
            appName,
            version: versionName,
            platform: 'android',
            scanResults: {
              aiRiskScore: finalScore,
              aiRiskLevel,
              aiSummary: aiAnalysis.summary,
              aiRecommendations: aiAnalysis.recommendations?.length ? aiAnalysis.recommendations : ['Réexaminez les permissions sensibles', 'Limiter les autorisations dangereuses', 'Mettre à jour l’application si possible'],
              permissions: permissions.map(p => ({ name: p })),
              trackers: trackersList.map(t => ({ name: t })),
              aiStatus: aiAnalysis.aiStatus,
            },
            finalScore: {
              score: finalScore,
              storeWeight: 0,
              ollamaWeight: 100,
              breakdown: 'APK static analysis',
            },
            lastScanned: new Date().toISOString(),
            fileName: originalName,
            mobsfHash: upload.md5,
            scanType: 'APK',
          },
        ],
        globalSummary: 'APK static analysis via MobSF',
        globalRecommendations: aiAnalysis.recommendations || [],
        statistics: {
          totalApps: 1,
          critical: aiRiskLevel === 'critical' ? 1 : 0,
          high: aiRiskLevel === 'high' ? 1 : 0,
          medium: aiRiskLevel === 'medium' ? 1 : 0,
          low: aiRiskLevel === 'low' ? 1 : 0,
          deviceRiskScore: finalScore,
        },
      },
    } as any;

    await this.scanRepository.save(scanRecord);

    // Upsert app entity
    await this.appRepository.update(packageName, {
      packageName,
      appName,
      version: versionName,
      platform: 'android',
      permissions,
      scanResults: scanRecord.results?.apps?.[0]?.scanResults,
      finalScore: {
        score: finalScore,
        storeWeight: 0,
        ollamaWeight: 100,
        breakdown: 'APK static analysis',
      },
      lastScanned: new Date(),
    });

    // Build response DTO
    return {
      id: scanRecord.id,
      packageName,
      appName,
      version: versionName,
      platform: 'android',
      scanResults: {
        aiRiskScore: finalScore,
        aiRiskLevel,
        aiSummary: aiAnalysis.summary,
        aiRecommendations: aiAnalysis.recommendations?.length ? aiAnalysis.recommendations : ['Réexaminez les permissions sensibles', 'Limiter les autorisations dangereuses', 'Mettre à jour l’application si possible'],
        permissions: permissions.map(p => ({ name: p })),
        trackers: trackersList.map(t => ({ name: t })),
        aiStatus: aiAnalysis.aiStatus,
      },
      finalScore,
      lastScanned: new Date().toISOString(),
    } as AppDto;
  }

  /**
   * Search for apps in Play Store with predictive risk score
   */
  async searchApp(request: SearchAppRequestDto): Promise<SearchAppResponseDto> {
    const { query, platform, limit = 10 } = request;

    this.logger.log(`Searching for "${query}" on ${platform}`);

    try {
      // Search in Play Store
      const searchResults = await this.playStoreService.searchApps(query, limit);

      // Analyze each result with Ollama for predictive scoring
      const results: SearchResultDto[] = await Promise.all(
        searchResults.map(async (app) => {
          // Get predictive risk analysis
          const appInfo = JSON.stringify({
            packageName: app.packageName,
            appName: app.appName,
            developer: app.developer,
            rating: app.rating,
          }).substring(0, 1000);

          const aiAnalysis = await this.ollamaService.analyzeAppSecurity(appInfo);
          const predictedScore = this.scoreCalculator.calculatePredictiveScore(
            app.rating || 0,
            aiAnalysis.summary
          );

          return {
            packageName: app.packageName,
            appName: app.appName,
            icon: app.icon || '',
            rating: app.rating || 0,
            downloads: app.downloads || 'Unknown',
            developer: app.developer || 'Unknown',
            predictedRiskScore: predictedScore.score,
            predictedRiskLevel: predictedScore.level as 'low' | 'medium' | 'high' | 'critical',
            predictedRecommendations: aiAnalysis.recommendations,
          };
        })
      );

      return { results };
    } catch (error: any) {
      this.logger.error(`Search failed: ${error.message}`);
      return { results: [] };
    }
  }

  /**
   * Get detailed app information
   */
  async getAppDetails(packageName: string): Promise<AppDetailsResponseDto> {
    // Try to find in database first
    const app = await this.appRepository.findByPackageName(packageName);

    if (!app) {
      // If not found, fetch from Play Store and analyze
      const storeData = await this.playStoreService.fetchAppDetails(packageName);
      const permissions = await this.playStoreService.fetchAppPermissions(packageName);

      const appInfo = JSON.stringify({
        packageName,
        permissions,
        storeData,
      }).substring(0, 2000);

      const aiAnalysis = await this.ollamaService.analyzeAppSecurity(appInfo);
      const riskData = this.scoreCalculator.calculateRiskScore(
        permissions,
        {},
        aiAnalysis.summary
      );

      // Build response for unscanned app
      return {
        app: {
          id: packageName,
          packageName,
          appName: storeData.appName || packageName,
          platform: 'android',
          storeData: {
            rating: storeData.rating,
            downloads: storeData.installCount,
            developer: storeData.publisher,
            icon: '', // Would need to fetch from store
          },
          scanResults: {
            aiRiskScore: riskData.aiRiskScore,
            aiRiskLevel: riskData.aiRiskLevel,
            aiSummary: aiAnalysis.summary,
            aiRecommendations: aiAnalysis.recommendations,
            permissions: permissions.map(p => ({
              name: p,
              translation: this.translatePermission(p),
              riskLevel: this.getPermissionRiskLevel(p),
              explanation: this.getPermissionExplanation(p),
            })),
          },
          finalScore: riskData.aiRiskScore,
        },
        history: [],
      };
    }

    // Map database app to DTO
    const finalScore = typeof app.finalScore === 'object' && 'score' in app.finalScore
      ? (app.finalScore as any).score
      : (typeof app.finalScore === 'number' ? app.finalScore : 0);

    return {
      app: {
        id: app.id || packageName,
        packageName: app.packageName,
        appName: app.appName || '',
        platform: app.platform || 'android',
        storeData: app.storeData as any,
        scanResults: app.scanResults as any,
        finalScore: finalScore,
        lastScanned: app.lastScanned?.toISOString(),
      },
      history: [],
    };
  }

  // =============== PRIVATE METHODS ===============

  /**
   * Perform analysis asynchronously (fire & forget)
   */
  // Async background execution removed intentionally (synchronous flow in startScan)

  /**
   * Analyze a single app
   */
  private async analyzeApp(packageName: string, displayName: string): Promise<any> {
    this.logger.debug(`[analyzeApp] 🔎 START: ${packageName}`);
    
    // Check cache first
    const cacheKey = `app:${packageName}`;
    this.logger.debug(`[analyzeApp] 📦 Checking cache for key: ${cacheKey}`);
    const cached = await this.cacheService.get<any>(cacheKey);
    if (cached) {
      this.logger.debug(`[analyzeApp] ✅ Cache HIT for ${packageName}`);
      return cached;
    }
    this.logger.debug(`[analyzeApp] ❌ Cache MISS for ${packageName}`);

    // Fetch store data
    this.logger.debug(`[analyzeApp] 🏪 Fetching Play Store data for ${packageName}...`);
    const storeDataStart = Date.now();
    const storeData = await this.playStoreService.fetchAppDetails(packageName);
    this.logger.debug(`[analyzeApp] ✅ Store data fetched in ${Date.now() - storeDataStart}ms`);
    
    this.logger.debug(`[analyzeApp] 🔐 Fetching permissions for ${packageName}...`);
    const permStart = Date.now();
    const permissions = await this.playStoreService.fetchAppPermissions(packageName);
    this.logger.debug(`[analyzeApp] ✅ Permissions fetched in ${Date.now() - permStart}ms - count: ${permissions.length}`);

    // Analyze with Ollama
    this.logger.debug(`[analyzeApp] 🤖 Starting Ollama analysis for ${packageName}...`);
    const appInfo = JSON.stringify({
      packageName,
      displayName,
      permissions,
      storeData,
    }).substring(0, 2000);

    const ollamaStart = Date.now();
    const aiAnalysis = await this.ollamaService.analyzeAppSecurity(appInfo);
    this.logger.debug(`[analyzeApp] ✅ Ollama analysis done in ${Date.now() - ollamaStart}ms`);

    // Calculate risk score using unified calculator (permissions + trackers + AI score)
    this.logger.debug(`[analyzeApp] 📊 Calculating risk score for ${packageName}...`);
    const trackers: string[] = [];
    const riskData = this.scoreCalculator.calculateRiskScore(
      permissions,
      trackers,
      aiAnalysis.summary,
      aiAnalysis.aiRiskScore,
    );

    // Calculate final score (70% Ollama + 30% Store)
    const storeScore = storeData.rating ? (storeData.rating / 5) * 100 : 50;
    let finalScore = Math.round(riskData.aiRiskScore * 0.7 + storeScore * 0.3);

    // Ensure final score never drops to 0
    if (finalScore <= 0) {
      const permHeuristic = Math.min(100, Math.max(10, permissions.length * 5));
      finalScore = Math.max(1, Math.round(permHeuristic * 0.6 + storeScore * 0.4));
    }

    const result = {
      packageName,
      appName: displayName || storeData.appName || packageName,
      platform: 'android',
      storeData: {
        rating: storeData.rating,
        downloads: storeData.installCount,
        developer: storeData.publisher,
        lastUpdate: null,
      },
      scanResults: {
        aiRiskScore: riskData.aiRiskScore,
        aiRiskLevel: riskData.aiRiskLevel,
        aiSummary: aiAnalysis.summary,
        aiRecommendations: aiAnalysis.recommendations || [],
        permissions: permissions.map(p => ({
          name: p,
          translation: this.translatePermission(p),
          riskLevel: this.getPermissionRiskLevel(p),
          explanation: this.getPermissionExplanation(p),
        })),
        trackers: [],
      },
      finalScore: {
        score: finalScore,
        storeWeight: 30,
        ollamaWeight: 70,
        breakdown: `Ollama (70%): ${Math.round(riskData.aiRiskScore * 0.7)} + Store (30%): ${Math.round(storeScore * 0.3)} = ${finalScore}`,
      },
      lastScanned: new Date(),
    };

    // Save to database
    await this.appRepository.save({
      packageName,
      appName: result.appName,
      platform: 'android',
      permissions: permissions,
      storeData: {
        ...result.storeData,
        lastUpdate: result.storeData.lastUpdate ? new Date(result.storeData.lastUpdate) : undefined,
      },
      scanResults: result.scanResults,
      finalScore: result.finalScore,
      lastScanned: new Date(),
    });

    // Cache for 24h
    await this.cacheService.set(cacheKey, result, 86400);

    return result;
  }

  /**
   * Calculate scan results summary
   */
  private async calculateScanResults(scanId: string): Promise<ScanResultsSummaryDto> {
    const scan = await this.scanRepository.findById(scanId);
    if (!scan || !scan.apps || scan.apps.length === 0) {
      return {
        totalScanned: 0,
        highRiskApps: 0,
        mediumRiskApps: 0,
        lowRiskApps: 0,
        averageScore: 0,
      };
    }

    const scores = scan.apps.map(app => {
      if (typeof app.finalScore === 'object' && 'score' in app.finalScore) {
        return (app.finalScore as any).score;
      }
      return typeof app.finalScore === 'number' ? app.finalScore : 0;
    });

    const averageScore = Math.round(
      scores.reduce((sum, score) => sum + score, 0) / scores.length
    );

    // High risk: score < 40, Medium: 40-70, Low: > 70
    const highRiskApps = scores.filter(s => s < 40).length;
    const mediumRiskApps = scores.filter(s => s >= 40 && s < 70).length;
    const lowRiskApps = scores.filter(s => s >= 70).length;

    return {
      totalScanned: scan.apps.length,
      highRiskApps,
      mediumRiskApps,
      lowRiskApps,
      averageScore,
    };
  }

  // =============== PERMISSION HELPERS ===============

  private translatePermission(permission: string): string {
    const translations: Record<string, string> = {
      'android.permission.CAMERA': 'Accès à la caméra',
      'android.permission.READ_CONTACTS': 'Lecture des contacts',
      'android.permission.WRITE_CONTACTS': 'Modification des contacts',
      'android.permission.ACCESS_FINE_LOCATION': 'Localisation précise',
      'android.permission.ACCESS_COARSE_LOCATION': 'Localisation approximative',
      'android.permission.RECORD_AUDIO': 'Enregistrement audio',
      'android.permission.READ_EXTERNAL_STORAGE': 'Lecture du stockage',
      'android.permission.WRITE_EXTERNAL_STORAGE': 'Écriture sur le stockage',
      'android.permission.INTERNET': 'Accès Internet',
      'android.permission.READ_PHONE_STATE': 'État du téléphone',
      'android.permission.SEND_SMS': 'Envoi de SMS',
      'android.permission.RECEIVE_SMS': 'Réception de SMS',
      'android.permission.CALL_PHONE': 'Appels téléphoniques',
      'android.permission.READ_CALL_LOG': 'Journal des appels',
      'android.permission.GET_ACCOUNTS': 'Accès aux comptes',
    };
    return translations[permission] || permission.split('.').pop() || permission;
  }

  private getPermissionRiskLevel(permission: string): 'normal' | 'dangerous' | 'signature' {
    const dangerous = [
      'CAMERA', 'READ_CONTACTS', 'WRITE_CONTACTS', 'ACCESS_FINE_LOCATION',
      'ACCESS_COARSE_LOCATION', 'RECORD_AUDIO', 'READ_EXTERNAL_STORAGE',
      'WRITE_EXTERNAL_STORAGE', 'READ_PHONE_STATE', 'SEND_SMS', 'RECEIVE_SMS',
      'CALL_PHONE', 'READ_CALL_LOG', 'GET_ACCOUNTS', 'READ_CALENDAR',
      'WRITE_CALENDAR', 'BODY_SENSORS',
    ];

    const permName = permission.split('.').pop() || '';
    return dangerous.includes(permName) ? 'dangerous' : 'normal';
  }

  private getPermissionExplanation(permission: string): string {
    const explanations: Record<string, string> = {
      'android.permission.CAMERA': "Permet à l'application de prendre des photos et vidéos sans votre intervention.",
      'android.permission.READ_CONTACTS': "L'application peut lire votre liste de contacts complète.",
      'android.permission.ACCESS_FINE_LOCATION': "L'application peut suivre votre position précise en temps réel.",
      'android.permission.RECORD_AUDIO': "L'application peut enregistrer de l'audio via le microphone.",
      'android.permission.READ_EXTERNAL_STORAGE': "L'application peut accéder à tous vos fichiers stockés.",
      'android.permission.READ_PHONE_STATE': "L'application peut lire votre numéro de téléphone et l'état des appels.",
      'android.permission.SEND_SMS': "L'application peut envoyer des SMS, potentiellement payants.",
      'android.permission.INTERNET': "Permet la communication réseau, normale pour la plupart des apps.",
    };
    return explanations[permission] || "Cette permission donne accès à des fonctionnalités du système.";
  }
}
