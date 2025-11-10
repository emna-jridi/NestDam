
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Scan } from './schemas/scan.schema';
import { MobsfService } from '../external-apis/mobsf.service';
import { AppRegistryService } from '../app-registry/app-registry.service';
import { RiskCalculatorService } from '../analysis/risk-calculator.service';
import { AnalyzeInstalledAppsDto, InstalledAppDto } from './dto/installed-apps.dto';

@Injectable()
export class ScanService {
  private readonly logger = new Logger(ScanService.name);

  constructor(
    @InjectModel(Scan.name) private scanModel: Model<Scan>,
    private mobsfService: MobsfService,
    private appRegistryService: AppRegistryService,
    private riskCalculator: RiskCalculatorService,
  ) { }

  // ⭐ NOUVEAU : Analyser les apps installées depuis le mobile
  async analyzeInstalledApps(dto: AnalyzeInstalledAppsDto) {
    this.logger.log(`Analyzing ${dto.apps.length} installed apps`);

    const results = await Promise.all(
      dto.apps.map(app => this.analyzeInstalledApp(app))
    );

    // Sauvegarder le scan global
    const scan = new this.scanModel({
      type: 'batch_installed',
      userHash: dto.userHash,
      report: {
        totalApps: dto.apps.length,
        results,
        summary: this.generateSummary(results),
      },
    });

    await scan.save();

    return {
      scanId: scan._id,
      totalApps: dto.apps.length,
      results,
      summary: this.generateSummary(results),
    };
  }

  // Analyser une app installée individuellement
  private async analyzeInstalledApp(appDto: InstalledAppDto) {
    try {
      // 1. Récupérer/créer l'entrée dans la base
      const app = await this.appRegistryService.getOrCreateApp(appDto.packageName);

      // 2. Calculer le score avec les données du mobile + base
      const riskResult = this.riskCalculator.calculateRiskScore({
        permissions: appDto.permissions,
        trackers: app.trackers || [],
        isDebuggable: appDto.isDebuggable || false,
        communityScore: app.communityScore,
      });

      // 3. Mettre à jour l'app si nécessaire
      if (appDto.isDebuggable !== undefined) {
        app.isDebuggable = appDto.isDebuggable;
        app.scanCount += 1;
        app.lastScanned = new Date();
        await app.save();
      }

      return {
        packageName: appDto.packageName,
        name: app.name,
        version: appDto.version,
        score: riskResult.score,
        riskLevel: this.riskCalculator.getRiskLevel(riskResult.score),
        alerts: riskResult.alerts,
        breakdown: riskResult.breakdown,
        trackers: app.trackers,
        permissions: {
          dangerous: riskResult.breakdown['permissions']?.list || [],
          total: appDto.permissions.length,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to analyze ${appDto.packageName}`, error);
      return {
        packageName: appDto.packageName,
        error: 'Analysis failed',
      };
    }
  }

  private generateSummary(results: any[]) {
    const validResults = results.filter(r => !r.error);

    const critical = validResults.filter(r => r.riskLevel === 'CRITICAL').length;
    const high = validResults.filter(r => r.riskLevel === 'HIGH').length;
    const medium = validResults.filter(r => r.riskLevel === 'MEDIUM').length;
    const low = validResults.filter(r => r.riskLevel === 'LOW').length;

    const avgScore = validResults.reduce((sum, r) => sum + r.score, 0) / validResults.length;

    return {
      avgScore: Math.round(avgScore),
      riskDistribution: { critical, high, medium, low },
      totalAlerts: validResults.reduce((sum, r) => sum + r.alerts.length, 0),
      mostDangerousApps: validResults
        .sort((a, b) => a.score - b.score)
        .slice(0, 5)
        .map(r => ({ packageName: r.packageName, name: r.name, score: r.score })),
    };
  }
  //  NOUVEAU : Rechercher la sécurité d'une app (avant installation)
  async searchAppSecurity(packageName: string) {
    this.logger.log(`Searching security info for: ${packageName}`);

    try {
      // Récupérer/créer l'app dans la base
      const app = await this.appRegistryService.getOrCreateApp(packageName);

      // Calculer les statistiques
      const stats = await this.getAppStats(packageName);

      // Retourner le rapport complet
      return {
        packageName: app.packageName,
        name: app.name,
        developer: app.developer,
        category: app.category,
        version: app.version,
        iconUrl: app.iconUrl,
        description: app.description,

        // Scores
        privacyScore: app.privacyScore,
        riskLevel: this.riskCalculator.getRiskLevel(app.privacyScore),
        riskColor: this.riskCalculator.getRiskColor(app.privacyScore),
        communityScore: app.communityScore,

        // Détails de sécurité
        permissions: {
          total: app.permissions.length,
          dangerous: this.getDangerousPermissions(app.permissions),
          list: app.permissions,
        },

        trackers: {
          total: app.trackers.length,
          list: app.trackers,
        },

        flags: {
          isDebuggable: app.isDebuggable,
          hasUnknownTrackers: this.hasUnknownTrackers(app.trackers),
        },

        // Données tierces
        playStoreData: app.playStoreData,
        exodusData: app.exodusData,

        // Stats
        stats,

        // Recommandations
        recommendations: this.generateRecommendations(app),

        // Alternatives
        alternatives: await this.findAlternatives(app),
      };

    } catch (error) {
      this.logger.error(`Failed to search app security: ${packageName}`, error);
      throw error;
    }
  }

  private getDangerousPermissions(permissions: string[]) {
    const dangerousList = [
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

    return permissions.filter(p => dangerousList.includes(p));
  }

  private hasUnknownTrackers(trackers: string[]): boolean {
    // À implémenter : vérifier contre une base de trackers connus
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

  private calculateAvgScore(scans: Scan[], packageName: string): number {
    const scores = scans
      .flatMap(scan => scan.report?.results || [])
      .filter(r => r.packageName === packageName && r.score)
      .map(r => r.score);

    if (scores.length === 0){ return 0;}

    const sum = scores.reduce((acc, score) => acc + score, 0);
    return sum / scores.length;
  }

  private generateRecommendations(app: any): string[] {
    const recommendations: string[] = [];

    if (app.privacyScore < 30) {
      recommendations.push('🔴 Désinstaller cette application - niveau de risque critique');
      recommendations.push('Rechercher une alternative plus sûre');
    } else if (app.privacyScore < 50) {
      recommendations.push('⚠️ Utiliser avec précaution');
      recommendations.push('Révoquer les permissions sensibles non essentielles');
    }

    if (app.isDebuggable) {
      recommendations.push('Application en mode debug - vulnérable aux attaques');
    }

    if (app.trackers.length > 5) {
      recommendations.push(`Contient ${app.trackers.length} trackers - considérer une alternative`);
    }

    const dangerousPerms = this.getDangerousPermissions(app.permissions);
    if (dangerousPerms.length > 3) {
      recommendations.push(`${dangerousPerms.length} permissions dangereuses - vérifier la nécessité`);
    }

    if (app.communityScore && app.communityScore < 2.5) {
      recommendations.push('Mauvaise réputation communautaire');
    }

    if (recommendations.length === 0) {
      recommendations.push('✅ Application relativement sûre');
      recommendations.push('Toujours surveiller les mises à jour');
    }

    return recommendations;
  }

  private async findAlternatives(app: any): Promise<any[]> {
    if (!app.category) return [];

    try {
      const alternatives = await this.appRegistryService.searchApps(app.category, 5);

      return alternatives
        .filter(alt => alt.packageName !== app.packageName)
        .filter(alt => alt.privacyScore > app.privacyScore)
        .slice(0, 3)
        .map(alt => ({
          packageName: alt.packageName,
          name: alt.name,
          privacyScore: alt.privacyScore,
          improvement: alt.privacyScore - app.privacyScore,
        }));
    } catch (error) {
      this.logger.error('Failed to find alternatives', error);
      return [];
    }
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
}