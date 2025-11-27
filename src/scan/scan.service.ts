import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Scan, ScanDocument } from './schemas/scan.schema';
import { Tracker } from '../app-registry/schemas/tracker.schema';
import { InstalledAppDto } from './dto/installed-apps.dto';
import { IosAppDto } from './dto/ios-screenshot.dto';
import { GetScansQueryDto } from './dto/get-scans.dto';
import {
  AppDetailsDto,
  PermissionsInfoDto,
  TrackersInfoDto,
} from './dto/app-details.dto';
import { ScanAnalyzerService } from './services/scan-analyzer.service';
import { ScanComparisonService } from './services/scan-comparison.service';
import { ScanStatisticsService } from './services/scan-statistics.service';
import { ScanSummaryService } from './services/scan-summary.service';
import { MobsfService } from '../external-apis/mobsf.service';
import { AppRegistryService } from '../app-registry/app-registry.service';
import { RiskCalculatorService } from '../analysis/risk-calculator.service';
import { PlayStoreService } from '../external-apis/play-store.service';
import { PermissionAnalyzerService } from '../analysis/permission-analyzer.service';
import { getRiskColor } from './shared/utils/risk-color.util';
import { EtipService } from 'src/external-apis/etip.service';
import { HttpService } from '@nestjs/axios';

@Injectable()
export class ScanService {
  private readonly logger = new Logger(ScanService.name);

  constructor(
    @InjectModel(Scan.name) private scanModel: Model<ScanDocument>,
    @InjectModel(Tracker.name) private trackerModel: Model<Tracker>,
    private readonly scanAnalyzer: ScanAnalyzerService,
    private readonly scanComparison: ScanComparisonService,
    private readonly scanStatistics: ScanStatisticsService,
    private readonly scanSummary: ScanSummaryService,
    private readonly mobsfService: MobsfService,
    private readonly appRegistryService: AppRegistryService,
    private readonly riskCalculator: RiskCalculatorService,
    private readonly playStoreService: PlayStoreService,
    private readonly permissionAnalyzer: PermissionAnalyzerService,
    private readonly etipService: EtipService,
    private readonly httpService: HttpService,

  ) { }

  async analyzeInstalledApps(userHash: string, apps: InstalledAppDto[]) {
    try {
      this.logger.log(
        `Analyzing ${apps.length} Android installed apps for user ${userHash}`,
      );

      const etipTrackers = await this.etipService.getAllTrackers();
      const results = await this.scanAnalyzer.analyzeAndroidApps(
        apps,
        etipTrackers,
      );
      const summary = this.scanSummary.generate(results);

      const scan = await this.scanModel.create({
        type: 'batch_installed',
        platform: 'android',
        userHash,
        totalApps: apps.length,
        report: { results },
        summary,
        status: 'BASIC_DONE',
        finalScore: this.computeGlobalScoreFromApps(results),
      });

      return {
        scanId: scan.id.toString(),
        userHash,
        totalApps: apps.length,
        status: scan.status,
        finalScore: scan.finalScore,
        results,
        summary,
        createdAt: scan.createdAt,
      };
    } catch (error: any) {
      this.logger.error('Failed to analyze installed apps', error.stack);
      throw new Error(`Failed to analyze installed apps: ${error.message}`);
    }
  }

  async analyzeIosApps(userHash: string, apps: IosAppDto[]) {
    try {
      this.logger.log(`Analyzing ${apps.length} iOS apps for user ${userHash}`);

      const etipTrackers = await this.etipService.getAllTrackers();
      const results = await this.scanAnalyzer.analyzeIosApps(apps, etipTrackers);

      const summary = this.scanSummary.generate(results);

      const scan = await this.scanModel.create({
        type: 'ios_screenshot',
        platform: 'ios',
        userHash,
        totalApps: apps.length,
        report: { results },
        summary,
        status: 'BASIC_DONE',
        finalScore: this.computeGlobalScoreFromApps(results),
      });

      return {
        scanId: scan.id.toString(),
        userHash,
        totalApps: apps.length,
        status: scan.status,
        finalScore: scan.finalScore,
        results,
        summary,
        createdAt: scan.createdAt ?? new Date(),
      };
    } catch (error: any) {
      this.logger.error('Failed to analyze iOS apps', error.stack);
      throw new Error(`Failed to analyze iOS apps: ${error.message}`);
    }
  }


  // ---------------------------------------------------------------------------
  // HISTORIQUE / LECTURE
  // ---------------------------------------------------------------------------
  async getUserScans(userHash: string, options: GetScansQueryDto) {
    return this.scanStatistics.getUserScans(userHash, options);
  }

  async getScanById(scanId: string) {
    try {
      this.logger.log(`🔍 Fetching scan: ${scanId}`);

      const scan = await this.scanModel.findById(scanId).lean().exec();

      if (!scan) {
        throw new NotFoundException(`Scan not found: ${scanId}`);
      }

      this.logger.log(`✅ Scan found: ${scan.totalApps} apps`);
      return scan;
    } catch (error) {
      this.logger.error('❌ Get scan by ID failed', error.stack);
      throw error;
    }
  }

  async getLatestScan(userHash: string) {
    try {
      this.logger.log(`Fetching latest scan for: ${userHash}`);

      const scan = await this.scanModel
        .findOne({ userHash })
        .sort({ createdAt: -1 })
        .lean()
        .exec();

      if (!scan) {
        this.logger.log(`No scans found for user: ${userHash}`);
        return null;
      }

      this.logger.log(`Latest scan: ${scan._id} (${scan.totalApps} apps)`);
      return scan;
    } catch (error) {
      this.logger.error('Get latest scan failed', error.stack);
      throw new Error(`Failed to get latest scan: ${error.message}`);
    }
  }

  async deleteScan(scanId: string, userHash: string) {
    try {
      this.logger.log(`Deleting scan: ${scanId}`);

      const scan = await this.scanModel.findOne({ _id: scanId, userHash });

      if (!scan) {
        throw new UnauthorizedException('Scan not found or unauthorized');
      }

      await this.scanModel.deleteOne({ _id: scanId });

      this.logger.log(`Scan deleted: ${scanId}`);
      return {
        success: true,
        message: 'Scan deleted successfully',
        deletedScanId: scanId,
      };
    } catch (error) {
      this.logger.error('Delete scan failed', error.stack);
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // COMPARAISON
  // ---------------------------------------------------------------------------
  async compareScans(scanId1: string, scanId2: string, userHash: string) {
    try {
      this.logger.log(`Comparing scans: ${scanId1} vs ${scanId2}`);

      const [scan1, scan2] = await Promise.all([
        this.scanModel.findOne({ _id: scanId1, userHash }).lean(),
        this.scanModel.findOne({ _id: scanId2, userHash }).lean(),
      ]);

      if (!scan1 || !scan2) {
        throw new NotFoundException('One or both scans not found');
      }

      return this.scanComparison.compare(scan1, scan2);
    } catch (error) {
      this.logger.error('Compare scans failed', error.stack);
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // STATISTIQUES
  // ---------------------------------------------------------------------------
  async getScanStatistics(userHash: string) {
    return this.scanStatistics.getStatistics(userHash);
  }

  // ---------------------------------------------------------------------------
  // SEARCH APPS
  // ---------------------------------------------------------------------------
  async searchAppsByName(query: string, limit: number = 20) {
    const dbResults = await this.appRegistryService.searchApps(query, limit);

    if (dbResults.length >= limit) {
      return dbResults.map((app) => this.formatDBApp(app));
    }

    const playResults = await this.playStoreService.searchApp(
      query,
      limit - dbResults.length,
    );

    const formattedPlay = playResults.map((app) => ({
      packageName: app.appId,
      name: app.title,
      developer: app.developer,
      iconUrl: app.icon,
      privacyScore: null,
      riskLevel: 'UNKNOWN',
      trackers: { total: 0, list: [] },
    }));

    return [
      ...dbResults.map((app) => this.formatDBApp(app)),
      ...formattedPlay,
    ];
  }

  async searchAppByPackage(packageName: string): Promise<AppDetailsDto> {
    try {
      const dbApp = await this.appRegistryService.searchApps(packageName);

      if (dbApp) {
        this.logger.log(`App found in DB: ${packageName}`);
        return this.transformToAppDetailsDto(dbApp);
      }

      this.logger.log(
        `App not in DB, fetching from Play Store: ${packageName}`,
      );
      const play = await this.playStoreService.getAppDetails(packageName);

      if (!play) {
        throw new HttpException(
          `App not found: ${packageName}`,
          HttpStatus.NOT_FOUND,
        );
      }

      return {
        packageName,
        name: play.name || packageName,
        developer: play.developer || '',
        category: play.category || '',
        version: play.version || '',
        iconUrl: play.iconUrl || '',
        description: play.description || '',
        privacyScore: 50,
        riskLevel: 'UNKNOWN',
        riskColor: getRiskColor('UNKNOWN'),
        communityScore: 0.0,
        permissions: { dangerous: [], total: 0 },
        trackers: { total: 0, list: [] },
        flags: { isDebuggable: false, hasUnknownTrackers: false },
        recommendations: [],
        alternatives: [],
        stats: undefined,
      };
    } catch (error) {
      this.logger.error(`Error in searchAppByPackage: ${error.message}`);
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // APK UPLOAD (MobSF)
  // ---------------------------------------------------------------------------
  async uploadApk(filePath: string) {
    try {
      const uploadResp = await this.mobsfService.uploadApk(filePath);
      const hash = uploadResp.hash || uploadResp.file_name;

      this.logger.log(`APK uploaded with hash: ${hash}`);

      await this.mobsfService.scanApk(hash);

      const report = await this.mobsfService.getReport(hash);
      const packageName = report.package_name || report.packageName;

      if (packageName) {
        const app = await this.appRegistryService.getOrCreateApp(packageName);
        app.mobsfData = report;
        app.isDebuggable = report.isDebuggable || false;
        app.permissions = report.permissions || [];
        app.lastScanned = new Date();

        const riskResult = this.riskCalculator.calculateRiskScore({
          permissions: app.permissions,
          trackers: app.trackers,
          isDebuggable: app.isDebuggable,
        });

        app.privacyScore = riskResult.score;
        await app.save();
      }

      const scan = new this.scanModel({
        type: 'apk',
        fileName: uploadResp.file_name,
        packageName,
        report,
        score: report.security_score || 0,
      });

      await scan.save();

      return {
        scanId: scan._id,
        packageName,
        report,
        analysis: this.analyzeMobsfReport(report),
      };
    } catch (error) {
      this.logger.error('APK upload and scan failed', error);
      throw error;
    }
  }

  private analyzeMobsfReport(report: any) {
    const vulnerabilities = report.vulnerabilities || [];
    const permissions = report.permissions || [];

    return {
      score: report.security_score || 0,
      vulnerabilitiesCount: vulnerabilities.length,
      criticalIssues: vulnerabilities.filter(
        (v) => v.severity === 'high' || v.severity === 'critical',
      ),
      dangerousPermissions:
        this.permissionAnalyzer.getDangerousPermissions(permissions),
      recommendations: this.generateMobsfRecommendations(report),
    };
  }

  private generateMobsfRecommendations(report: any): string[] {
    const recommendations: string[] = [];

    if (report.isDebuggable) {
      recommendations.push('Désactiver le mode debug avant publication');
    }

    if (report.allowBackup) {
      recommendations.push(
        'Désactiver allowBackup pour protéger les données',
      );
    }

    if (
      report.network_security &&
      !report.network_security.cleartextTrafficPermitted === false
    ) {
      recommendations.push('Forcer HTTPS - trafic cleartext détecté');
    }

    if (report.code_analysis?.high_severity > 0) {
      recommendations.push(
        `${report.code_analysis.high_severity} vulnérabilités critiques trouvées`,
      );
    }

    return recommendations;
  }

  // ---------------------------------------------------------------------------
  // METADATA SCAN (déjà existant)
  // ---------------------------------------------------------------------------
  async analyzeMetadata(meta: any) {
    const riskResult = this.riskCalculator.calculateRiskScore({
      permissions: meta.permissions || [],
      trackers: meta.trackers || [],


      isDebuggable: meta.isDebuggable || false,
    });

    const scan = new this.scanModel({
      type: 'metadata',
      packageName: meta.packageName,
      score: riskResult.score,
      report: {
        score: riskResult.score,
        riskLevel: this.riskCalculator.getRiskLevel(riskResult.score),
        alerts: riskResult.alerts,
        breakdown: riskResult.breakdown,
        metadata: meta,
      },
    });

    await scan.save();

    return {
      scanId: scan._id,
      score: riskResult.score,
      riskLevel: this.riskCalculator.getRiskLevel(riskResult.score),
      alerts: riskResult.alerts,
      breakdown: riskResult.breakdown,
    };
  }

  // ---------------------------------------------------------------------------
  // 🔥 NOUVEAU : réception & fusion des résultats DEEP (n8n → webhook)
  // ---------------------------------------------------------------------------

  async receiveDeepAnalysisResult(scanId: string, deepResult: any) {
    this.logger.log(
      `📥 Receiving deep analysis result for scan ${scanId} (package=${deepResult?.packageName})`,
    );

    try {
      const scan = await this.scanModel.findById(scanId);

      if (!scan) {
        this.logger.warn(
          `Scan not found when saving deep analysis result: ${scanId}`,
        );
        return;
      }

      // On garde le dernier résultat deep au niveau du scan
      scan.deepAnalysis = deepResult;
      scan.deepAnalysisCompletedAt = new Date();

      // Si on connaît le package → merge dans report.results[*]
      const pkg = deepResult?.packageName;
      if (
        pkg &&
        scan.report &&
        Array.isArray(scan.report.results) &&
        scan.report.results.length
      ) {
        const results = scan.report.results as any[];

        const index = results.findIndex(
          (app) => app.packageName === pkg,
        );

        if (index === -1) {
          this.logger.warn(
            `App ${pkg} not found in scan ${scanId} results, storing deepAnalysis only at scan level`,
          );
        } else {
          const existingApp = results[index];
          const mergedApp = this.mergePerAppWithDeep(existingApp, deepResult);
          results[index] = mergedApp;
          scan.report.results = results;
        }
      }

      // Recalcule un score global
      if (scan.report && Array.isArray(scan.report.results)) {
        scan.finalScore = this.computeGlobalScoreFromApps(
          scan.report.results as any[],
        );
      }

      scan.status = 'COMPLETE';

      await scan.save();

      this.logger.log(
        `✅ Deep analysis result saved and merged for scan ${scanId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to save deep analysis result: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Merge BASIC + DEEP au niveau d’une app :
   * - ajoute deepAnalysis
   * - fusionne trackers
   * - met à jour aggregatedScore / riskLevel / privacyScore
   */
  private mergePerAppWithDeep(basicApp: any, deepResult: any): any {
    const merged: any = {
      ...basicApp,
      deepAnalysis: deepResult,
    };

    // 1) Fusion trackers
    if (Array.isArray(deepResult?.trackers)) {
      const existing = new Set<string>(basicApp.trackers || []);
      for (const t of deepResult.trackers) {
        if (typeof t === 'string') existing.add(t);
        else if (t?.name) existing.add(t.name);
      }
      merged.trackers = Array.from(existing);
    }

    // 2) Fusion score agrégé
    merged.aggregatedScore = this.mergeAggregatedScore(
      basicApp.aggregatedScore,
      deepResult,
    );

    // 3) Mettre à jour riskLevel / privacyScore pour rester cohérent
    if (merged.aggregatedScore?.finalScore != null) {
      merged.privacyScore = merged.aggregatedScore.finalScore;

      merged.riskLevel =
        merged.aggregatedScore.riskLevel ||
        this.getRiskLevelFromScore(merged.aggregatedScore.finalScore);
    }

    return merged;
  }

  /**
   * Fusionne :
   * - basic aggregatedScore (si présent)
   * - deepResult.aiRisk (si présent)
   */
  private mergeAggregatedScore(
    basicAgg: any | undefined,
    deepResult: any,
  ): {
    finalScore: number;
    riskLevel: string;
    breakdown: any;
    sources: string[];
    alerts: string[];
  } {
    const basicScore =
      basicAgg?.finalScore ??
      basicAgg?.privacy ??
      basicAgg?.security ??
      null;

    const aiRiskScore = deepResult?.aiRisk?.riskScore ?? null;

    let finalScore: number;

    if (basicScore != null && aiRiskScore != null) {
      // pondération 60% basic, 40% AI
      finalScore = Math.round(basicScore * 0.6 + aiRiskScore * 0.4);
    } else if (aiRiskScore != null) {
      finalScore = aiRiskScore;
    } else if (basicScore != null) {
      finalScore = basicScore;
    } else {
      finalScore = 50;
    }

    const sources = new Set<string>(basicAgg?.sources || []);
    sources.add('BASIC');
    sources.add('AI_DEEP_ANALYSIS');
    if (deepResult?.exodus) sources.add('EXODUS');

    const alerts: string[] = [
      ...(basicAgg?.alerts || []),
      ...(deepResult?.aiRisk?.concerns || []),
    ];

    const riskLevel = this.getRiskLevelFromScore(finalScore);

    const breakdown = {
      ...(basicAgg?.breakdown || {}),
      aiRisk: deepResult?.aiRisk || null,
    };

    return {
      finalScore,
      riskLevel,
      breakdown,
      sources: Array.from(sources),
      alerts,
    };
  }

  private getRiskLevelFromScore(
    score: number,
  ): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    if (score >= 70) return 'LOW';
    if (score >= 50) return 'MEDIUM';
    if (score >= 30) return 'HIGH';
    return 'CRITICAL';
  }

  /**
   * Calcule un score global pour le scan à partir des apps
   */
  private computeGlobalScoreFromApps(results: any[]): number {
    if (!results || !results.length) return 50;

    const scores: number[] = [];

    for (const app of results) {
      if (app?.aggregatedScore?.finalScore != null) {
        scores.push(app.aggregatedScore.finalScore);
      } else if (typeof app?.privacyScore === 'number') {
        scores.push(app.privacyScore);
      }
    }

    if (!scores.length) return 50;

    const sum = scores.reduce((a, b) => a + b, 0);
    return Math.round(sum / scores.length);
  }

  // ---------------------------------------------------------------------------
  // PRIVATE FORMATTERS (inchangés)
  // ---------------------------------------------------------------------------
  private formatDBApp(app: any) {
    return {
      packageName: app.packageName,
      name: app.name,
      developer: app.developer,
      category: app.category,
      iconUrl: app.iconUrl,
      privacyScore: app.privacyScore ?? null,
      riskLevel: app.riskLevel ?? 'UNKNOWN',
      trackers: {
        total: app.trackers?.length ?? 0,
        list: app.trackers ?? [],
      },
    };
  }

  private transformToAppDetailsDto(dbApp: any): AppDetailsDto {
    const riskLevel = (dbApp.riskLevel || 'LOW').toUpperCase();
    const riskColor = getRiskColor(riskLevel);

    let permissionsDto: PermissionsInfoDto;
    if (Array.isArray(dbApp.permissions)) {
      const dangerousPerms = dbApp.permissions.filter((p: string) =>
        this.permissionAnalyzer.isDangerousPermission(p),
      );
      permissionsDto = {
        dangerous: dangerousPerms,
        total: dbApp.permissions.length,
      };
    } else if (dbApp.permissions && typeof dbApp.permissions === 'object') {
      permissionsDto = {
        dangerous: dbApp.permissions.dangerous || [],
        total: dbApp.permissions.total || 0,
      };
    } else {
      permissionsDto = {
        dangerous: [],
        total: 0,
      };
    }

    let trackersDto: TrackersInfoDto;
    if (Array.isArray(dbApp.trackers)) {
      trackersDto = {
        total: dbApp.trackers.length,
        list: dbApp.trackers,
      };
    } else if (dbApp.trackers && typeof dbApp.trackers === 'object') {
      trackersDto = {
        total: dbApp.trackers.total || 0,
        list: dbApp.trackers.list || [],
      };
    } else {
      trackersDto = {
        total: 0,
        list: [],
      };
    }

    return {
      packageName: dbApp.packageName,
      name: dbApp.name || dbApp.packageName,
      developer: dbApp.developer || '',
      category: dbApp.category || '',
      version: dbApp.version || '',
      iconUrl: dbApp.iconUrl || '',
      description: dbApp.description || '',
      privacyScore: dbApp.privacyScore || 50,
      riskLevel,
      riskColor,
      communityScore: dbApp.communityScore || 0.0,
      permissions: permissionsDto,
      trackers: trackersDto,
      flags: {
        isDebuggable: dbApp.isDebuggable || false,
        hasUnknownTrackers: dbApp.trackers?.length > 0 || false,
      },
      recommendations: dbApp.recommendations || [],
      alternatives: dbApp.alternatives || [],
      stats: dbApp.scanCount
        ? {
          totalScans: dbApp.scanCount || 0,
          avgScoreFromCommunity: dbApp.communityScore,
          lastScanned: dbApp.lastScanned,
        }
        : undefined,
    };
  }

  async scanAllApps(userHash: string, apps: any[]) {
    const etipTrackers = await this.etipService.getAllTrackers();
    const results = await this.scanAnalyzer.analyzeAndroidApps(apps, etipTrackers);

    const scan = await this.scanModel.create({
      type: 'quick_scan',
      userHash,
      totalApps: apps.length,
      report: { results },
      summary: this.scanSummary.generate(results),
    });

    return {
      scanId: scan.id.toString(),
      userHash,
      totalApps: apps.length,
      results,
      summary: scan.summary,
      createdAt: scan.createdAt,
    };
  }



  // 🟥 Deep analysis for a single app
  async deepAnalyzeApp(userHash: string, app: any) {
    const etipTrackers = await this.etipService.getAllTrackers();

    // 1) Perform fast analysis of the SINGLE app
    const [basic] = await this.scanAnalyzer.analyzeAndroidApps([app], etipTrackers);

    // 2) Create scan in DB BEFORE sending to n8n
    const scan = await this.scanModel.create({
      type: 'deep_scan',
      userHash,
      totalApps: 1,
      report: { results: [basic] },
      summary: this.scanSummary.generate([basic]),
      deepAnalysis: null,
      status: "pending",
    });

    // 3) Trigger async deep analysis
    await this.triggerDeepAnalysisN8n(app, scan._id.toString());

    return {
      success: true,
      message: "Deep analysis started",
      scanId: scan._id.toString(),
      result: basic,
    };
  }



  // 🟦 helper for deep analysis
 private async triggerDeepAnalysisN8n(app: any, scanId: string) {
  try {
    await this.httpService.axiosRef.post(
      `${process.env.N8N_URL}/shadowguard-deep-analysis`,
      {
        scanId,
        context: app,
      }
    );
  } catch (err) {
    this.logger.error("Failed to trigger n8n deep analysis", err);
  }
}

}
