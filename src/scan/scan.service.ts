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
import { EtipService } from 'src/external-apis/etip.service';
import { log } from 'console';
import { EtipTracker } from 'src/external-apis/interfaces/etip-tracker.interface';
import { IosAppDto } from './dto/ios-screenshot.dto';

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
    private etipService: EtipService,
  ) { }

  // -------------------------------------------------------------
  //  MAIN ENTRY : ANALYZE INSTALLED APPS FROM MOBILE -
  // -------------------------------------------------------------
async analyzeInstalledApps(userHash: string, apps: InstalledAppDto[]) {
    try {
      // 1) Get all ETIP trackers (cached in Redis)
      const etipTrackers = await this.etipService.getAllTrackers();

      // 2) Analyze each app with ETIP + heuristics + permissions
      const results = await Promise.all(
        apps.map((app) =>
          this.analyzeInstalledAppWithDetection(app, etipTrackers),
        ),
      );

      // 3) Generate summary
      const summary = this.generateSummary(results);

      // 4) Save scan in Mongo
      const scan = await this.scanModel.create({
        type: 'batch_installed',
        userHash,
        totalApps: apps.length,
        report: {
          results,
        },
        summary,
      });

      // 5) Return response to mobile
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


  // -------------------------------------------------------------
  //  Analyze ONE single installed app - 
  // -------------------------------------------------------------
  private async analyzeInstalledAppWithDetection(
    app: InstalledAppDto,
    etipTrackers: EtipTracker[],
  ) {
    const packageName = app.packageName ?? '';
    const appName = app.name ?? packageName;

    const permissions = app.permissions ?? [];
    const trackersHints = app.trackers ?? []; // strings from mobile scan (libs, SDKs, etc.)
    const isDebuggable = !!app.isDebuggable;

    // 1) Dangerous permissions (Android official dangerous group)
    const dangerousPermissions = this.getDangerousPermissions(permissions);

    // 2) ETIP matching
    const matchedEtipTrackers = this.matchTrackersWithEtip(
      packageName,
      trackersHints,
      etipTrackers,
    );

    // 3) Heuristic detection (filenames, libs, suspicious combos)
    const heuristicFindings = this.detectHeuristicBehaviors(app, dangerousPermissions, matchedEtipTrackers);

    // 4) Compute score
    const {
      score,
      permissionPenalty,
      trackerPenalty,
      debugPenalty,
      heuristicPenalty,
      riskLevel,
    } = this.computeScore({
      dangerousPermissions,
      etipTrackers: matchedEtipTrackers,
      isDebuggable,
      heuristicFindings,
    });

    // 5) Build alerts
    const alerts = this.buildAlerts({
      appName,
      dangerousPermissions,
      matchedEtipTrackers,
      isDebuggable,
      heuristicFindings,
      riskLevel,
    });

    // 6) Return enriched result
    return {
      packageName,
      name: appName,
      version: app.version ?? '',
      score,
      riskLevel,
      alerts,
      breakdown: {
        permissions: {
          penalty: permissionPenalty,
          count: dangerousPermissions.length,
          list: dangerousPermissions,
        },
        trackers: {
          penalty: trackerPenalty,
          count: matchedEtipTrackers.length,
          list: matchedEtipTrackers.map((t) => t.name),
        },
        heuristics: {
          penalty: heuristicPenalty,
          count: heuristicFindings.length,
          list: heuristicFindings,
        },
        debug: {
          penalty: debugPenalty,
          isDebuggable,
        },
      },
      trackers: matchedEtipTrackers.map((t) => t.name),
      permissions: {
        dangerous: dangerousPermissions,
        total: permissions.length,
      },
    };
  }

    /**
   * Returns list of dangerous permissions from full list
   */
  private getDangerousPermissions(allPermissions: string[]): string[] {
    const dangerousKeywords = [
      'READ_SMS',
      'RECEIVE_SMS',
      'SEND_SMS',
      'READ_CONTACTS',
      'WRITE_CONTACTS',
      'READ_CALL_LOG',
      'WRITE_CALL_LOG',
      'RECORD_AUDIO',
      'CAMERA',
      'ACCESS_FINE_LOCATION',
      'ACCESS_COARSE_LOCATION',
      'ACCESS_BACKGROUND_LOCATION',
      'READ_CALENDAR',
      'WRITE_CALENDAR',
      'READ_EXTERNAL_STORAGE',
      'WRITE_EXTERNAL_STORAGE',
      'READ_MEDIA_IMAGES',
      'READ_MEDIA_VIDEO',
      'READ_MEDIA_AUDIO',
      'MANAGE_ACCOUNTS',
      'USE_CREDENTIALS',
      'READ_PHONE_STATE',
      'PROCESS_OUTGOING_CALLS',
    ];

    const lowerDangerous = dangerousKeywords.map((p) => p.toLowerCase());

    return allPermissions.filter((p) =>
      lowerDangerous.some((d) => p.toLowerCase().includes(d)),
    );
  }

    /**
   * Match installed app with ETIP trackers using:
   * - code_signature
   * - network_signature
   * - package name + "hints" from the device
   */
  private matchTrackersWithEtip(
    packageName: string,
    trackersHints: string[],
    etipTrackers: EtipTracker[],
  ): EtipTracker[] {
    const lowerPkg = packageName.toLowerCase();
    const lowerHints = trackersHints.map((s) => s.toLowerCase());

    return etipTrackers.filter((t) => {
      const codeSig = t.code_signature?.toLowerCase() ?? '';
      const netSig = t.network_signature?.toLowerCase() ?? '';

      const matchesCode =
        !!codeSig &&
        (lowerPkg.includes(codeSig) ||
          lowerHints.some((s) => s.includes(codeSig)));

      const matchesNet =
        !!netSig &&
        (lowerPkg.includes(netSig) ||
          lowerHints.some((s) => s.includes(netSig)));

      return matchesCode || matchesNet;
    });
  }
  /**
   * Heuristic detection of suspicious behaviors
   */
  private detectHeuristicBehaviors(
    app: InstalledAppDto,
    dangerousPermissions: string[],
    matchedTrackers: EtipTracker[],
  ): string[] {
    const findings: string[] = [];
    const perms = dangerousPermissions.map((p) => p.toUpperCase());

    const hasLocation =
      perms.some((p) =>
        ['ACCESS_FINE_LOCATION', 'ACCESS_BACKGROUND_LOCATION', 'ACCESS_COARSE_LOCATION'].some((k) =>
          p.includes(k),
        ),
      );

    const hasCamera = perms.some((p) => p.includes('CAMERA'));
    const hasMic = perms.some((p) => p.includes('RECORD_AUDIO'));
    const hasContacts = perms.some((p) => p.includes('READ_CONTACTS'));
    const hasSms = perms.some((p) => p.includes('READ_SMS') || p.includes('RECEIVE_SMS'));
    const hasCallLog = perms.some((p) => p.includes('READ_CALL_LOG'));

    // Example heuristics
    if (hasLocation && matchedTrackers.length > 2) {
      findings.push(
        'Possible precise location tracking with multiple trackers',
      );
    }

    if (hasCamera && hasMic && matchedTrackers.length > 0) {
      findings.push(
        'Camera + microphone + trackers: potential surveillance risk',
      );
    }

    if (hasContacts && matchedTrackers.length > 0) {
      findings.push(
        'Access to contacts combined with trackers: high profiling potential',
      );
    }

    if (hasSms || hasCallLog) {
      findings.push('App can access SMS or call logs: sensitive metadata risk');
    }

    // You can also use app.name / category to tune heuristics later
    return findings;
  }
    /**
   * Compute score & penalties based on:
   * - dangerous permissions
   * - ETIP trackers
   * - debug flag
   * - heuristic findings
   */
  private computeScore(params: {
    dangerousPermissions: string[];
    etipTrackers: EtipTracker[];
    isDebuggable: boolean;
    heuristicFindings: string[];
  }) {
    const { dangerousPermissions, etipTrackers, isDebuggable, heuristicFindings } = params;

    // Penalties
    const permissionPenalty = dangerousPermissions.length * 5; // 5 points per dangerous perm
    const trackerPenalty = etipTrackers.length * 3; // 3 per tracker
    const debugPenalty = isDebuggable ? 15 : 0; // dev build shipped
    const heuristicPenalty = heuristicFindings.length * 5; // 5 per heuristic alert

    let rawScore =
      100 - (permissionPenalty + trackerPenalty + debugPenalty + heuristicPenalty);

    rawScore = Math.max(0, Math.min(100, rawScore));

    const riskLevel =
      rawScore < 25
        ? 'CRITICAL'
        : rawScore < 50
        ? 'HIGH'
        : rawScore < 75
        ? 'MEDIUM'
        : 'LOW';

    return {
      score: rawScore,
      riskLevel,
      permissionPenalty,
      trackerPenalty,
      debugPenalty,
      heuristicPenalty,
    };
  }
  private buildAlerts(params: {
    appName: string;
    dangerousPermissions: string[];
    matchedEtipTrackers: EtipTracker[];
    isDebuggable: boolean;
    heuristicFindings: string[];
    riskLevel: string;
  }): string[] {
    const {
      appName,
      dangerousPermissions,
      matchedEtipTrackers,
      isDebuggable,
      heuristicFindings,
      riskLevel,
    } = params;

    const alerts: string[] = [];

    if (dangerousPermissions.length) {
      alerts.push(
        `${dangerousPermissions.length} dangerous permission(s) detected`,
      );
    }

    if (matchedEtipTrackers.length) {
      alerts.push(`${matchedEtipTrackers.length} tracker(s) detected`);
    }

    if (isDebuggable) {
      alerts.push('App is debuggable (dev build) – higher attack surface');
    }

    alerts.push(...heuristicFindings);

    alerts.push(`Overall risk level: ${riskLevel}`);

    // Optional: if CRITICAL, add a warning
    if (riskLevel === 'CRITICAL') {
      alerts.push(
        `We strongly recommend reviewing or uninstalling "${appName}" due to high privacy risks.`,
      );
    }

    return alerts;
  }


  // -------------------------------------------------------------
  //  SUMMARY GENERATOR
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
// -------------------------------------------------------------
//  iOS: ANALYZE APPS FROM SCREENSHOT
// -------------------------------------------------------------
async analyzeIosApps(userHash: string, apps: IosAppDto[]) {
  try {
    const results = await Promise.all(
      apps.map((app) => this.analyzeSingleIosApp(app)),
    );

    const summary = this.generateSummary(results);

    const scan = await this.scanModel.create({
      type: 'ios_screenshot',
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
  } catch (error: any) {
    this.logger.error('Failed to analyze iOS apps', error.stack);
    throw new Error(`Failed to analyze iOS apps: ${error.message}`);
  }
}
// -------------------------------------------------------------
//  iOS: ANALYZE A SINGLE APP
// -------------------------------------------------------------
// -------------------------------------------------------------
//  iOS: ANALYZE SINGLE APP WITH ETIP-BASED DETECTION
// -------------------------------------------------------------
// -------------------------------------------------------------
//  iOS: ANALYZE SINGLE APP WITH ETIP-BASED DETECTION (SAFE)
// -------------------------------------------------------------
private async analyzeSingleIosApp(app: IosAppDto) {
  const appName = app.name ?? 'Unknown app';
  const bundleId = app.bundleId ?? null;
  const category = app.category ?? null;

  let etipTrackers: EtipTracker[] = [];
  let matchedEtipTrackers: EtipTracker[] = [];

  // 1) Try to get ETIP trackers (fail gracefully if ETIP is unavailable)
  try {
    etipTrackers = await this.etipService.getAllTrackers();
    matchedEtipTrackers = this.matchIosAppWithEtip(app, etipTrackers);
    this.logger.debug(
      `[iOS] ${appName} matched ${matchedEtipTrackers.length} ETIP trackers`,
    );
  } catch (error) {
    this.logger.warn(
      `[iOS] ETIP unavailable, skipping tracker matching: ${error.message}`,
    );
    // Continue without ETIP - will use heuristics only
  }

  const dangerousPermissions: string[] = []; // inconnu sur iOS via screenshot
  const isDebuggable = false; // pas pertinent pour iOS App Store

  // 2) Enhanced heuristics (works even without ETIP)
  const heuristicFindings = this.detectIosHeuristicsMinimal(
    app,
    matchedEtipTrackers,
  );

  const {
    score,
    permissionPenalty,
    trackerPenalty,
    debugPenalty,
    heuristicPenalty,
    riskLevel,
  } = this.computeScore({
    dangerousPermissions,
    etipTrackers: matchedEtipTrackers,
    isDebuggable,
    heuristicFindings,
  });

  const alerts = this.buildAlerts({
    appName,
    dangerousPermissions,
    matchedEtipTrackers,
    isDebuggable,
    heuristicFindings,
    riskLevel,
  });

  return {
    platform: 'iOS',
    bundleId,
    category: app.category ?? null,
    packageName: bundleId ?? appName,
    name: appName,
    version: '',
    score,
    riskLevel,
    alerts,
    breakdown: {
      permissions: {
        penalty: permissionPenalty,
        count: 0,
        list: [],
      },
      trackers: {
        penalty: trackerPenalty,
        count: matchedEtipTrackers.length,
        list: matchedEtipTrackers.map((t) => t.name),
      },
      heuristics: {
        penalty: heuristicPenalty,
        count: heuristicFindings.length,
        list: heuristicFindings,
      },
      debug: {
        penalty: debugPenalty,
        isDebuggable,
      },
    },
    trackers: matchedEtipTrackers.map((t) => t.name),
    permissions: {
      dangerous: [],
      total: 0,
    },
  };
}

// -------------------------------------------------------------
//  Match iOS App with ETIP Trackers (based on company/developer)
// -------------------------------------------------------------
private matchIosAppWithEtip(app: IosAppDto, etipTrackers: EtipTracker[]): EtipTracker[] {
  const matched: EtipTracker[] = [];
  const bundleId = (app.bundleId ?? '').toLowerCase();
  const appName = (app.name ?? '').toLowerCase();

  // iOS bundle IDs structure: com.company.appname
  // Exemple: com.google.ios.youtube, com.facebook.Facebook, com.burbn.instagram
  const bundleParts = bundleId.split('.');
  const companyIdentifier = bundleParts.length >= 2 ? bundleParts[1] : '';

  for (const tracker of etipTrackers) {
    const trackerName = (tracker.name ?? '').toLowerCase();
    const trackerWebsite = (tracker.website ?? '').toLowerCase();
    const trackerCodeSignature = (tracker.code_signature ?? '').toLowerCase();
    const trackerDescription = (tracker.description ?? '').toLowerCase();

    let isMatch = false;
    let matchReason = '';

    // ==========================================
    // 1. Match by company identifier in bundle ID
    // ==========================================
    // Ex: com.google.* matches Google trackers
    // Ex: com.facebook.* matches Facebook/Meta trackers
    if (companyIdentifier && trackerName.includes(companyIdentifier)) {
      isMatch = true;
      matchReason = `Bundle ID company identifier matches tracker: ${tracker.name}`;
    }

    // ==========================================
    // 2. Match by app name
    // ==========================================
    // Ex: "Facebook" app matches Facebook tracker
    // Ex: "Instagram" matches Meta/Facebook tracker
    if (!isMatch && appName && trackerName.includes(appName)) {
      isMatch = true;
      matchReason = `App name matches tracker: ${tracker.name}`;
    }

    // ==========================================
    // 3. Match by known company mappings
    // ==========================================
    // Instagram → Facebook/Meta
    // YouTube → Google
    // WhatsApp → Meta
    const companyMappings: Record<string, string[]> = {
      'facebook': ['instagram', 'whatsapp', 'messenger', 'meta', 'facebook'],
      'google': ['youtube', 'gmail', 'maps', 'chrome', 'drive', 'photos'],
      'bytedance': ['tiktok', 'douyin'],
      'twitter': ['x'],
      'microsoft': ['linkedin', 'skype', 'outlook', 'teams'],
      'snap': ['snapchat'],
      'amazon': ['amazon', 'prime', 'kindle'],
    };

    if (!isMatch) {
      for (const [company, appNames] of Object.entries(companyMappings)) {
        if (trackerName.includes(company)) {
          for (const appPattern of appNames) {
            if (appName.includes(appPattern) || bundleId.includes(appPattern)) {
              isMatch = true;
              matchReason = `App belongs to ${company} ecosystem (${tracker.name})`;
              break;
            }
          }
        }
        if (isMatch) break;
      }
    }

    // ==========================================
    // 4. Match by tracker website domain vs bundle ID
    // ==========================================
    // Ex: tracker.website = "google.com" matches bundle "com.google.*"
    if (!isMatch && trackerWebsite) {
      const websiteDomain = trackerWebsite
        .replace('http://', '')
        .replace('https://', '')
        .replace('www.', '')
        .split('/')[0]
        .split('.')[0]; // Extract main domain
      
      if (websiteDomain && bundleId.includes(websiteDomain)) {
        isMatch = true;
        matchReason = `Bundle ID matches tracker website domain: ${tracker.website}`;
      }
    }

    // ==========================================
    // 5. Match by code signature patterns (if available)
    // ==========================================
    if (!isMatch && trackerCodeSignature && bundleId.includes(trackerCodeSignature)) {
      isMatch = true;
      matchReason = `Bundle ID matches tracker code signature`;
    }

    if (isMatch) {
      this.logger.debug(`[iOS ETIP Match] ${appName} (${bundleId}) → ${tracker.name} (${matchReason})`);
      matched.push(tracker);
    }
  }

  return matched;
}

// -------------------------------------------------------------
//  iOS: MINIMAL HEURISTICS (to complement ETIP)
// -------------------------------------------------------------
private detectIosHeuristicsMinimal(app: IosAppDto, matchedTrackers: EtipTracker[]): string[] {
  const findings: string[] = [];
  const name = (app.name ?? '').toLowerCase();
  const bundleId = (app.bundleId ?? '').toLowerCase();
  const category = (app.category ?? '').toLowerCase();

  // ==========================================
  // 1. VPN/Proxy apps (spécifique iOS, pas toujours dans ETIP)
  // ==========================================
  if (/(vpn|proxy|tunnel)/.test(name) || /(vpn|proxy)/.test(bundleId)) {
    findings.push('VPN/Proxy app – can monitor all network traffic');
  }

  // ==========================================
  // 2. Third-party keyboards (risque spécifique iOS)
  // ==========================================
  if (/keyboard/.test(name) && !bundleId.includes('apple')) {
    findings.push('Third-party keyboard – can capture everything you type');
  }

  // ==========================================
  // 3. Cleaner/Optimizer apps (souvent scammy)
  // ==========================================
  if (/(clean|boost|optimizer|speed|battery saver)/.test(name)) {
    findings.push('Cleaner/Optimizer app – often requests unnecessary permissions');
  }

  // ==========================================
  // 4. Photo/Video apps with social features
  // ==========================================
  if (/(photo|camera|video|edit)/.test(category) && matchedTrackers.length > 0) {
    findings.push('Photo/Video app with tracking – may upload your media');
  }

  // ==========================================
  // 5. Dating apps (privacy concerns)
  // ==========================================
  if (/(dating|match|tinder|bumble|hinge)/.test(name) || category.includes('lifestyle')) {
    if (matchedTrackers.length > 0) {
      findings.push('Dating app with tracking – collects sensitive personal data');
    }
  }

  // ==========================================
  // 6. Gaming apps with trackers (ads + analytics)
  // ==========================================
  if (category.includes('game') && matchedTrackers.length > 2) {
    findings.push('Game with multiple trackers – aggressive ad tracking detected');
  }

  // ==========================================
  // 7. Free apps from unknown developers with trackers
  // ==========================================
  const isUnknownDev = !bundleId.includes('apple') && 
                        !bundleId.includes('google') && 
                        !bundleId.includes('microsoft');
  
  if (isUnknownDev && matchedTrackers.length > 0) {
    findings.push('Third-party app with tracking capabilities');
  }

  return findings;
}

}