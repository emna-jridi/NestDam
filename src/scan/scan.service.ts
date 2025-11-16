
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Scan } from './schemas/scan.schema';
import { MobsfService } from '../external-apis/mobsf.service';
import { AppRegistryService } from '../app-registry/app-registry.service';
import { RiskCalculatorService } from '../analysis/risk-calculator.service';
import { AnalyzeInstalledAppsDto, InstalledAppDto } from './dto/installed-apps.dto';
import { ExodusPrivacyService } from '../external-apis/exodus-privacy.service';
import { report } from 'process';
import { async } from 'rxjs';
import { TrackerDetectorService } from 'src/analysis/tracker-detector.service';
import { Tracker } from 'src/app-registry/schemas/tracker.schema';

@Injectable()
export class ScanService {
  private readonly logger = new Logger(ScanService.name);

  constructor(
    @InjectModel(Scan.name) private scanModel: Model<Scan>,
    @InjectModel(Tracker.name) private trackerModel: Model<Tracker>,
    private trackerDetector: TrackerDetectorService,

    private mobsfService: MobsfService,
    private exodusService: ExodusPrivacyService,
    private appRegistryService: AppRegistryService,
    private riskCalculator: RiskCalculatorService,
  ) { }

  // -------------------------------------------------------------
  // ⭐ MAIN ENTRY : ANALYZE INSTALLED APPS FROM MOBILE
  // -------------------------------------------------------------
  async analyzeInstalledApps(userHash: string, apps: InstalledAppDto[]) {

    // Charger tous les trackers de MongoDB
    const trackers = await this.trackerModel.find().exec();

    const results = apps.map(app => {
      const detectedTrackers = this.trackerDetector.detectTrackers(app, trackers);

      return {
        packageName: app.packageName,
        name: app.name,
        permissions: app.permissions,
        trackers: detectedTrackers,
        totalTrackers: detectedTrackers.length,
      };
    });

    return {
      scanId: crypto.randomUUID(),
      userHash,
      totalApps: apps.length,
      results,
      summary: {
        totalTrackers: results.reduce((acc, r) => acc + r.totalTrackers, 0)
      }
    };
  }


  // -------------------------------------------------------------
  // ⭐ Analyze ONE single installed app - ✅ CORRIGÉ
  // -------------------------------------------------------------
  private async analyzeInstalledApp(appDto: InstalledAppDto) {
    try {
      // 1. Load app from registry (exists or create)
      const app = await this.appRegistryService.getOrCreateApp(appDto.packageName);

      // ✅ 2. Fusionner les trackers provenant de plusieurs sources
      // Sources: mobile (appDto.trackers), Exodus (exodusService), DB (app.trackers)
      const mobileTrackers: string[] = appDto.trackers || [];
      this.logger.debug(`Mobile trackers count: ${mobileTrackers.length} for ${appDto.packageName}`);

      // Interroger Exodus en parallèle (même si mobile a fourni des trackers,
      // on récupère cependant les données externes pour enrichir/compléter)
      this.logger.debug(`Querying Exodus for ${appDto.packageName}...`);
      const exodusTrackers: string[] = await this.exodusService.getTrackers(appDto.packageName);
      this.logger.debug(`Exodus trackers count: ${exodusTrackers.length} for ${appDto.packageName}`);

      const dbTrackers: string[] = app.trackers || [];
      this.logger.debug(`DB trackers count: ${dbTrackers.length} for ${app.packageName}`);

      // Fusionner et dédupliquer (préserver l'ordre: DB -> Exodus -> Mobile)
      const mergedSet = new Set<string>([...dbTrackers, ...exodusTrackers, ...mobileTrackers]);
      const finalTrackers = Array.from(mergedSet);

      // Sauvegarder les trackers fusionnés dans l'objet app (pour usage/futurs scans)
      app.trackers = finalTrackers;

      // Enregistrer une trace des sources pour audit/debug (champ libre, schema peut l'ignorer)
      try {
        (app as any).trackerSources = {
          mobileCount: mobileTrackers.length,
          exodusCount: exodusTrackers.length,
          dbCount: dbTrackers.length,
          mergedCount: finalTrackers.length,
          lastFetched: new Date(),
        };
      } catch (e) {
        this.logger.debug('Could not set trackerSources on app object', e?.message || e);
      }

      this.logger.log(`Final trackers count: ${finalTrackers.length} for ${appDto.packageName}`);

      // 3. Calculate risk
      const riskResult = this.riskCalculator.calculateRiskScore({
        permissions: appDto.permissions,
        trackers: finalTrackers,
        isDebuggable: appDto.isDebuggable || app.isDebuggable || false,
        communityScore: app.communityScore,
      });

      // 4. Update app metadata
      app.isDebuggable = appDto.isDebuggable ?? app.isDebuggable;
      app.scanCount += 1;
      app.lastScanned = new Date();
      app.privacyScore = riskResult.score; // ✅ Mettre à jour le score

      await app.save();

      // 5. Final Response
      return {
        packageName: appDto.packageName,
        name: app.name,
        version: appDto.version,
        score: riskResult.score,
        riskLevel: this.riskCalculator.getRiskLevel(riskResult.score),
        alerts: riskResult.alerts,
        breakdown: riskResult.breakdown,
        trackers: finalTrackers, // ✅ Maintenant rempli !
        permissions: {
          dangerous: riskResult.breakdown['permissions']?.list || [],
          total: appDto.permissions.length,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to analyze ${appDto.packageName}`, error.stack);
      return {
        packageName: appDto.packageName,
        name: appDto.name || 'Unknown',
        score: 0,
        riskLevel: 'UNKNOWN',
        error: 'Analysis failed',
        trackers: [],
        permissions: { dangerous: [], total: 0 },
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

  private async getAppStats(packageName: string) {
    const scans = await this.scanModel
      .find({ 'report.results.packageName': packageName })
      .limit(100)
      .exec();

    return {
      totalScans: scans.length,
      lastScanned: scans[0]?.createdAt || null,
      avgScoreFromCommunity: this.calculateAvgScore(scans, packageName),
    };
  }


  private calculateAvgScore(scans: Scan[], packageName: string) {
    const scores = scans
      .flatMap(s => s.report?.results || [])
      .filter(r => r.packageName === packageName && r.score !== undefined)
      .map(r => r.score);

    if (!scores.length) return 0;

    return scores.reduce((a, b) => a + b, 0) / scores.length;
  }

  private generateRecommendations(app: any) {
    const rec: string[] = [];

    if (app.privacyScore < 30) {
      rec.push('🔴 RISQUE CRITIQUE - désinstaller cette application');
    }

    if (app.trackers?.length > 5) {
      rec.push(`⚠️ Trop de trackers (${app.trackers.length})`);
    }

    if (this.getDangerousPermissions(app.permissions).length > 3) {
      rec.push('⚠️ Permissions très sensibles détectées');
    }

    if (rec.length === 0) rec.push('✅ Application relativement sûre');
    return rec;
  }


  // Méthode existante uploadApk (améliorée)
  async uploadApk(filePath: string) {
    try {
      // 1. Upload vers MobSF
      const uploadResp = await this.mobsfService.uploadApk(filePath);
      const hash = uploadResp.hash || uploadResp.file_name;

      this.logger.log(`APK uploaded with hash: ${hash}`);

      // 2. Scanner avec MobSF
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

  // Méthode existante analyzeMetadata (améliorée)
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
}