import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Scan } from './schemas/scan.schema';
import { MobsfService } from '../external-apis/mobsf.service';
import { AppRegistryService } from '../app-registry/app-registry.service';
import { RiskCalculatorService } from '../analysis/risk-calculator.service';
import { AnalyzeInstalledAppsDto, InstalledAppDto } from './dto/installed-apps.dto';
import { ExodusService } from '../external-apis/exodus.service';
import { async } from 'rxjs';
import { TrackerDetectorService } from 'src/analysis/tracker-detector.service';
import { Tracker } from 'src/app-registry/schemas/tracker.schema';
import { ComparisonResultDto } from './dto/compare-scans.dto';
import { GetScansQueryDto, GetScansResponseDto, SortOrder } from './dto/get-scans.dto';

@Injectable()
export class ScanService {
  private readonly logger = new Logger(ScanService.name);

  constructor(
    @InjectModel(Scan.name) private scanModel: Model<Scan>,
    @InjectModel(Tracker.name) private trackerModel: Model<Tracker>,
    private trackerDetector: TrackerDetectorService,

    private mobsfService: MobsfService,
    private exodusService: ExodusService,
    private appRegistryService: AppRegistryService,
    private riskCalculator: RiskCalculatorService,
  ) { }

  // -------------------------------------------------------------
  //  MAIN ENTRY : ANALYZE INSTALLED APPS FROM MOBILE - ✅ CORRIGÉ
  // -------------------------------------------------------------
  async analyzeInstalledApps(userHash: string, apps: InstalledAppDto[]) {

    try {
      const allTrackers = await this.trackerModel.find().exec();
      const results = await Promise.all(
        apps.map(app => this.analyzeInstalledAppWithDetection(app, allTrackers))
      );

      const summary = this.generateSummary(results);

      const scan = await this.scanModel.create({
        type: 'batch_installed',
        userHash,
        totalApps: apps.length,
        report: {
          results,
        },
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

    } catch (error) {
      throw new Error(`Failed to analyze installed apps: ${error.message}`);
    }
  }


  // -------------------------------------------------------------
  // ⭐ Analyze ONE single installed app - ✅ CORRIGÉ
  // -------------------------------------------------------------
  private async analyzeInstalledAppWithDetection(
    appDto: InstalledAppDto,
    allTrackers: Tracker[]
  ) {
    try {
      const app = await this.appRegistryService.getOrCreateApp(appDto.packageName);

      const mobileTrackers: string[] = appDto.trackers || [];

      const detectedTrackerObjects = this.trackerDetector.detectTrackers(appDto, allTrackers);
      const detectorTrackers: string[] = detectedTrackerObjects.map(t => t.name).filter(Boolean);
      const exodusTrackers: string[] = await this.exodusService.getTrackers(appDto.packageName);

      const dbTrackers: string[] = app.trackers || [];

      const mergedSet = new Set<string>([
        ...dbTrackers,
        ...exodusTrackers,
        ...detectorTrackers,
        ...mobileTrackers
      ]);
      const finalTrackers = Array.from(mergedSet);
      app.trackers = finalTrackers;

      const riskResult = this.riskCalculator.calculateRiskScore({
        permissions: appDto.permissions,
        trackers: finalTrackers,
        isDebuggable: appDto.isDebuggable || app.isDebuggable || false,
        communityScore: app.communityScore,
      });

      app.isDebuggable = appDto.isDebuggable ?? app.isDebuggable;
      app.scanCount += 1;
      app.lastScanned = new Date();
      app.privacyScore = riskResult.score;

      await app.save();

      return {
        packageName: appDto.packageName,
        name: app.name,
        version: appDto.version,
        score: riskResult.score,
        riskLevel: this.riskCalculator.getRiskLevel(riskResult.score),
        alerts: riskResult.alerts,
        breakdown: riskResult.breakdown,
        trackers: finalTrackers,
        permissions: {
          dangerous: riskResult.breakdown['permissions']?.list || [],
          total: appDto.permissions.length,
        },
      };

    } catch (error) {
      return {
        packageName: appDto.packageName,
        name: appDto.name || 'Unknown',
        score: 0,
        riskLevel: 'UNKNOWN',
        error: 'Analysis failed',
        trackers: [],
        permissions: { dangerous: [], total: 0 },
        alerts: [],
      };
    }
  }

  // -------------------------------------------------------------
  // ⭐ SUMMARY GENERATOR
  // -------------------------------------------------------------
  private generateSummary(results: any[]) {
    const valid = results.filter(r => !r.error);

    if (valid.length === 0) {
      return {
        avgScore: 0,
        riskDistribution: { critical: 0, high: 0, medium: 0, low: 0 },
        totalAlerts: 0,
        mostDangerousApps: [],
      };
    }

    const avgScore = valid.reduce((sum, r) => sum + r.score, 0) / valid.length;

    return {
      avgScore: Math.round(avgScore),
      riskDistribution: {
        critical: valid.filter(r => r.riskLevel === 'CRITICAL').length,
        high: valid.filter(r => r.riskLevel === 'HIGH').length,
        medium: valid.filter(r => r.riskLevel === 'MEDIUM').length,
        low: valid.filter(r => r.riskLevel === 'LOW').length,
      },
      totalAlerts: valid.reduce((sum, r) => sum + r.alerts.length, 0),
      mostDangerousApps: valid
        .sort((a, b) => a.score - b.score)
        .slice(0, 5)
        .map(r => ({ packageName: r.packageName, name: r.name, score: r.score })),
    };
  }

  private getDangerousPermissions(list: string[]) {
    const dangerous = [
      'android.permission.READ_SMS',
      'android.permission.SEND_SMS',
      'android.permission.READ_CONTACTS',
      'android.permission.WRITE_CONTACTS',
      'android.permission.RECORD_AUDIO',
      'android.permission.CAMERA',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.READ_CALL_LOG',
      'android.permission.WRITE_CALL_LOG',
    ];

    return list.filter(p => dangerous.includes(p));
  }
  private hasUnknownTrackers(trackers: string[]) {
    // Later: compare to known trackers list
    return false;
  }







  // Méthode existante uploadApk (améliorée)
  async uploadApk(filePath: string) {
    try {
      // 1. Upload vers MobSF
      const uploadResp = await this.mobsfService.uploadApk(filePath);
      const hash = uploadResp.hash || uploadResp.file_name;

      this.logger.log(`APK uploaded with hash: ${hash}`);

      await this.mobsfService.scanApk(hash);

      // 3. Récupérer le rapport
      const report = await this.mobsfService.getReport(hash);

      // 4. Extraire le package name
      const packageName = report.package_name || report.packageName;

      // 5. Mettre à jour l'app dans la base
      if (packageName) {
        const app = await this.appRegistryService.getOrCreateApp(packageName);
        app.mobsfData = report;
        app.isDebuggable = report.isDebuggable || false;
        app.permissions = report.permissions || [];
        app.lastScanned = new Date();

        // Recalculer le score
        const riskResult = this.riskCalculator.calculateRiskScore({
          permissions: app.permissions,
          trackers: app.trackers,
          isDebuggable: app.isDebuggable,
        });

        app.privacyScore = riskResult.score;
        await app.save();
      }

      // 6. Sauvegarder le scan
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
      criticalIssues: vulnerabilities.filter(v => v.severity === 'high' || v.severity === 'critical'),
      dangerousPermissions: this.getDangerousPermissions(permissions),
      recommendations: this.generateMobsfRecommendations(report),
    };
  }

  private generateMobsfRecommendations(report: any): string[] {
    const recommendations: string[] = [];

    if (report.isDebuggable) {
      recommendations.push('Désactiver le mode debug avant publication');
    }

    if (report.allowBackup) {
      recommendations.push('Désactiver allowBackup pour protéger les données');
    }

    if (report.network_security && !report.network_security.cleartextTrafficPermitted === false) {
      recommendations.push('Forcer HTTPS - trafic cleartext détecté');
    }

    if (report.code_analysis?.high_severity > 0) {
      recommendations.push(`${report.code_analysis.high_severity} vulnérabilités critiques trouvées`);
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
  private async findAlternatives(app: any) {
    if (!app.category) return [];

    const candidates = await this.appRegistryService.searchApps(app.category, 5);

    return candidates
      .filter(x => x.packageName !== app.packageName)
      .filter(x => x.privacyScore > app.privacyScore)
      .slice(0, 3)
      .map(x => ({
        packageName: x.packageName,
        name: x.name,
        privacyScore: x.privacyScore,
        improvement: x.privacyScore - app.privacyScore,
      }));
  }

  // -------------------------------------------------------------
  // SCAN HISTORY - GET ALL SCANS
  // -------------------------------------------------------------
  async getUserScans(
    userHash: string,
    options: GetScansQueryDto,): Promise<GetScansResponseDto> {
    try {
      this.logger.log(`📜 Fetching scans for user: ${userHash}`);

      const {
        limit = 10,
        page = 1,
        sortOrder = SortOrder.DESC,
        startDate,
        endDate,
        minApps,
        maxApps,
      } = options;
      const filter: any = { userHash };

      if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) filter.createdAt.$gte = new Date(startDate);
        if (endDate) filter.createdAt.$lte = new Date(endDate);
      }
      if (minApps !== undefined || maxApps !== undefined) {
        filter.totalApps = {};
        if (minApps !== undefined) filter.totalApps.$gte = minApps;
        if (maxApps !== undefined) filter.totalApps.$lte = maxApps;
      }

      //  Compter le total
      const total = await this.scanModel.countDocuments(filter);

      //  Calculer la pagination
      const skip = (page - 1) * limit;
      const totalPages = Math.ceil(total / limit);

      //  Récupérer les scans
      const scans = await this.scanModel
        .find(filter)
        .sort({ createdAt: sortOrder === SortOrder.DESC ? -1 : 1 })
        .skip(skip)
        .limit(limit)
        .select('-__v') // Exclure __v
        .lean()
        .exec();

      this.logger.log(`✅ Found ${scans.length} scans (page ${page}/${totalPages})`);

      // ✅ Calculer les statistiques
      const stats = await this.calculateUserStats(userHash);

      return {
        scans,
        pagination: {
          total,
          page,
          limit,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
        stats,
      };
    } catch (error) {
      this.logger.error('❌ Get user scans failed', error.stack);
      throw new Error(`Failed to get user scans: ${error.message}`);
    }
  }

  // -------------------------------------------------------------
  // 📊 CALCULATE USER STATS
  // -------------------------------------------------------------
  private async calculateUserStats(userHash: string): Promise<{
    totalScans: number;
    avgAppsPerScan: number;
    avgScore: number;
    totalAppsScanned: number;
  } | null> {
    try {
      const scans = await this.scanModel.find({ userHash }).lean().exec();

      if (scans.length === 0) {
        return {
          totalScans: 0,
          avgAppsPerScan: 0,
          avgScore: 0,
          totalAppsScanned: 0,
        };
      }

      // ✅ AJOUTÉ: Vérification pour totalApps
      const totalApps = scans.reduce((sum, scan) => sum + (scan.totalApps || 0), 0);
      const totalScore = scans.reduce(
        (sum, scan) => sum + (scan.summary?.avgScore || 0),
        0,
      );

      return {
        totalScans: scans.length,
        avgAppsPerScan: Math.round(totalApps / scans.length),
        avgScore: Math.round(totalScore / scans.length),
        totalAppsScanned: totalApps,
      };
    } catch (error) {
      this.logger.error('❌ Calculate stats failed', error.stack);
      return null;
    }
  }

  // -------------------------------------------------------------
  // 🔍 GET SCAN BY ID
  // -------------------------------------------------------------
  async getScanById(scanId: string) {
    try {
      this.logger.log(`🔍 Fetching scan: ${scanId}`);

      const scan = await this.scanModel.findById(scanId).lean().exec();

      if (!scan) {
        throw new Error(`Scan not found: ${scanId}`);
      }

      this.logger.log(`✅ Scan found: ${scan.totalApps} apps`);
      return scan;
    } catch (error) {
      this.logger.error('❌ Get scan by ID failed', error.stack);
      throw new Error(`Failed to get scan: ${error.message}`);
    }
  }

  // -------------------------------------------------------------
  // 📌 GET LATEST SCAN
  // -------------------------------------------------------------
  async getLatestScan(userHash: string) {
    try {
      this.logger.log(`📌 Fetching latest scan for: ${userHash}`);

      const scan = await this.scanModel
        .findOne({ userHash })
        .sort({ createdAt: -1 })
        .lean()
        .exec();

      if (!scan) {
        this.logger.log(`ℹ️ No scans found for user: ${userHash}`);
        return null;
      }

      this.logger.log(`✅ Latest scan: ${scan._id} (${scan.totalApps} apps)`);
      return scan;
    } catch (error) {
      this.logger.error('❌ Get latest scan failed', error.stack);
      throw new Error(`Failed to get latest scan: ${error.message}`);
    }
  }

  // -------------------------------------------------------------
  // 🗑️ DELETE SCAN
  // -------------------------------------------------------------
  async deleteScan(scanId: string, userHash: string) {
    try {
      this.logger.log(`🗑️ Deleting scan: ${scanId}`);

      const scan = await this.scanModel.findOne({ _id: scanId, userHash });

      if (!scan) {
        throw new Error('Scan not found or unauthorized');
      }

      await this.scanModel.deleteOne({ _id: scanId });

      this.logger.log(`✅ Scan deleted: ${scanId}`);
      return {
        success: true,
        message: 'Scan deleted successfully',
        deletedScanId: scanId,
      };
    } catch (error) {
      this.logger.error('❌ Delete scan failed', error.stack);
      throw new Error(`Failed to delete scan: ${error.message}`);
    }
  }

  // -------------------------------------------------------------
  // 🔄 COMPARE TWO SCANS
  // -------------------------------------------------------------
  async compareScans(
    scanId1: string,
    scanId2: string,
    userHash: string,
  ): Promise<ComparisonResultDto> {
    try {
      this.logger.log(`🔄 Comparing scans: ${scanId1} vs ${scanId2}`);

      const [scan1, scan2] = await Promise.all([
        this.scanModel.findOne({ _id: scanId1, userHash }).lean().exec(),
        this.scanModel.findOne({ _id: scanId2, userHash }).lean().exec(),
      ]);

      if (!scan1 || !scan2) {
        throw new Error('One or both scans not found');
      }

      const packages1 = new Set<string>(
        scan1.report.results.map((r: any) => String(r.packageName))
      );
      const packages2 = new Set<string>(
        scan2.report.results.map((r: any) => String(r.packageName))
      );

      const newApps: string[] = Array.from(packages2).filter(
        (p: string) => !packages1.has(p)
      );
      const removedApps: string[] = Array.from(packages1).filter(
        (p) => !packages2.has(p)
      );
      const unchangedApps: string[] = Array.from(packages1).filter((p) =>
        packages2.has(p)
      );

      const scoreChanges: Array<{
        packageName: string;
        name: string;
        oldScore: number;
        newScore: number;
        change: number;
      }> = [];

      for (const pkg of unchangedApps) {
        const app1 = scan1.report.results.find(
          (r: any) => r.packageName === pkg
        );
        const app2 = scan2.report.results.find(
          (r: any) => r.packageName === pkg
        );

        if (app1 && app2 && app1.score !== app2.score) {
          scoreChanges.push({
            packageName: pkg,
            name: app2.name || 'Unknown',
            oldScore: app1.score || 0,
            newScore: app2.score || 0,
            change: (app2.score || 0) - (app1.score || 0),
          });
        }
      }

      // ✅ Trier par changement (plus grand changement en premier)
      scoreChanges.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

      // ✅ Calculer le changement moyen de score
      const avgScoreChange =
        scoreChanges.length > 0
          ? scoreChanges.reduce((sum, c) => sum + c.change, 0) /
          scoreChanges.length
          : 0;

      this.logger.log(
        `✅ Comparison complete: ${newApps.length} new, ${removedApps.length} removed`,
      );

      return {
        scan1: {
          scanId: scan1._id.toString(),
          scanDate: scan1.createdAt || new Date(), // ✅ Valeur par défaut
          totalApps: scan1.totalApps || 0, // ✅ Valeur par défaut
          avgScore: scan1.summary?.avgScore || 0,
        },
        scan2: {
          scanId: scan2._id.toString(),
          scanDate: scan2.createdAt || new Date(), // ✅ Valeur par défaut
          totalApps: scan2.totalApps || 0, // ✅ Valeur par défaut
          avgScore: scan2.summary?.avgScore || 0,
        },
        differences: {
          newApps,
          removedApps,
          unchangedApps,
          scoreChanges,
        },
        summary: {
          totalChanges: newApps.length + removedApps.length + scoreChanges.length,
          appsAdded: newApps.length,
          appsRemoved: removedApps.length,
          avgScoreChange: Math.round(avgScoreChange),
        },
      };
    } catch (error) {
      this.logger.error('❌ Compare scans failed', error.stack);
      throw new Error(`Failed to compare scans: ${error.message}`);
    }
  }

  // -------------------------------------------------------------
  // 📊 GET SCAN STATISTICS
  // -------------------------------------------------------------
  async getScanStatistics(userHash: string) {
    try {
      this.logger.log(`📊 Getting statistics for: ${userHash}`);

      const scans = await this.scanModel
        .find({ userHash })
        .sort({ createdAt: -1 })
        .lean()
        .exec();

      if (scans.length === 0) {
        return {
          totalScans: 0,
          firstScan: null,
          lastScan: null,
          avgAppsPerScan: 0,
          avgScore: 0,
          scoreEvolution: [],
          appsEvolution: [],
        };
      }

      // ✅ Évolution du score dans le temps
      const scoreEvolution = scans.map((scan) => ({
        date: scan.createdAt,
        avgScore: scan.summary?.avgScore || 0,
        scanId: scan._id.toString(),
      }));

      // ✅ Évolution du nombre d'apps dans le temps
      const appsEvolution = scans.map((scan) => ({
        date: scan.createdAt,
        totalApps: scan.totalApps,
        scanId: scan._id.toString(),
      }));

      const stats = await this.calculateUserStats(userHash);

      return {
        totalScans: scans.length,
        firstScan: scans[scans.length - 1].createdAt,
        lastScan: scans[0].createdAt,
        avgAppsPerScan: stats?.avgAppsPerScan || 0,
        avgScore: stats?.avgScore || 0,
        scoreEvolution: scoreEvolution.reverse(), // Chronologique
        appsEvolution: appsEvolution.reverse(), // Chronologique
      };
    } catch (error) {
      this.logger.error('❌ Get statistics failed', error.stack);
      throw new Error(`Failed to get statistics: ${error.message}`);
    }
  }
}