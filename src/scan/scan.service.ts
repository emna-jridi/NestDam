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
import { Scan } from './schemas/scan.schema';
import { Tracker } from '../app-registry/schemas/tracker.schema';
import { InstalledAppDto } from './dto/installed-apps.dto';
import { IosAppDto } from './dto/ios-screenshot.dto';
import { GetScansQueryDto } from './dto/get-scans.dto';
import { AppDetailsDto, PermissionsInfoDto, TrackersInfoDto } from './dto/app-details.dto';
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

@Injectable()
export class ScanService {
  private readonly logger = new Logger(ScanService.name);

  constructor(
    @InjectModel(Scan.name) private scanModel: Model<Scan>,
    @InjectModel(Tracker.name) private trackerModel: Model<Tracker>,
    private scanAnalyzer: ScanAnalyzerService,
    private scanComparison: ScanComparisonService,
    private scanStatistics: ScanStatisticsService,
    private scanSummary: ScanSummaryService,
    private mobsfService: MobsfService,
    private appRegistryService: AppRegistryService,
    private riskCalculator: RiskCalculatorService,
    private playStoreService: PlayStoreService,
    private permissionAnalyzer: PermissionAnalyzerService,
    private readonly etipService: EtipService,
  ) { }
  //android
  async analyzeInstalledApps(userHash: string, apps: InstalledAppDto[]) {
    try {
      const etipTrackers = await this.etipService.getAllTrackers();
      const results = await this.scanAnalyzer.analyzeAndroidApps(apps, etipTrackers);
      const summary = this.scanSummary.generate(results);

      const scan = await this.scanModel.create({
        type: 'batch_installed',
        userHash,
        totalApps: apps.length,
        report: { results },
        summary,
      });

      return {
        scanId: scan.id.toString(),
        userHash,
        totalApps: apps.length,
        results,
        summary,
        createdAt: scan.createdAt,
      };
    } catch (error: any) {
      this.logger.error('Failed to analyze installed apps', error.stack);
      throw new Error(`Failed to analyze installed apps: ${error.message}`);
    }
  }
  //ios 
  async analyzeIosApps(userHash: string, apps: InstalledAppDto []) {
    try {
      const etipTrackers = await this.etipService.getAllTrackers();
      const results = await this.scanAnalyzer.analyzeIosApps(apps, etipTrackers);
      const summary = this.scanSummary.generate(results);

      const scan = await this.scanModel.create({
        type: 'ios_screenshot',
        userHash,
        totalApps: apps.length,
        report: { results },
        summary,
      });

      return {
        scanId: scan.id.toString(),
        userHash,
        totalApps: apps.length,
        results,
        summary,
        createdAt: scan.createdAt,
      };
    } catch (error: any) {
      this.logger.error('Failed to analyze iOS apps', error.stack);
      throw new Error(`Failed to analyze iOS apps: ${error.message}`);
    }
  }

  // SCAN HISTORY

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

      this.logger.log(` Scan found: ${scan.totalApps} apps`);
      return scan;
    } catch (error) {
      this.logger.error('❌ Get scan by ID failed', error.stack);
      throw error;
    }
  }

  async getLatestScan(userHash: string) {
    try {
      this.logger.log(` Fetching latest scan for: ${userHash}`);

      const scan = await this.scanModel
        .findOne({ userHash })
        .sort({ createdAt: -1 })
        .lean()
        .exec();

      if (!scan) {
        this.logger.log(`No scans found for user: ${userHash}`);
        return null;
      }

      this.logger.log(` Latest scan: ${scan._id} (${scan.totalApps} apps)`);
      return scan;
    } catch (error) {
      this.logger.error(' Get latest scan failed', error.stack);
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

      this.logger.log(` Scan deleted: ${scanId}`);
      return {
        success: true,
        message: 'Scan deleted successfully',
        deletedScanId: scanId,
      };
    } catch (error) {
      this.logger.error(' Delete scan failed', error.stack);
      throw error;
    }
  }

  //  COMPARE SCANS

  async compareScans(scanId1: string, scanId2: string, userHash: string) {
    try {
      this.logger.log(` Comparing scans: ${scanId1} vs ${scanId2}`);

      const [scan1, scan2] = await Promise.all([
        this.scanModel.findOne({ _id: scanId1, userHash }).lean(),
        this.scanModel.findOne({ _id: scanId2, userHash }).lean(),
      ]);

      if (!scan1 || !scan2) {
        throw new NotFoundException('One or both scans not found');
      }

      return this.scanComparison.compare(scan1, scan2);
    } catch (error) {
      this.logger.error(' Compare scans failed', error.stack);
      throw error;
    }
  }

  // STATISTICS
  async getScanStatistics(userHash: string) {
    return this.scanStatistics.getStatistics(userHash);
  }

  //  APP SEARCH
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

  //  APK UPLOAD (MobSF)
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

  //  PRIVATE FORMATTERS
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
      riskLevel: riskLevel,
      riskColor: riskColor,
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
}