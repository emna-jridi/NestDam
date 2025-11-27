// src/scan/services/scan-analyzer.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Scan } from '../schemas/scan.schema';
import { InstalledAppDto } from '../dto/installed-apps.dto';
import { EtipTracker } from '../../external-apis/interfaces/etip-tracker.interface';
import { RiskCalculatorService } from '../../analysis/risk-calculator.service';
import { PermissionAnalyzerService } from '../../analysis/permission-analyzer.service';
import { HeuristicDetectorService } from '../../analysis/heuristic-detector.service';
import { EtipService } from '../../external-apis/etip.service';
import { IosAppDto } from '../dto/ios-screenshot.dto';

@Injectable()
export class ScanAnalyzerService {
  private readonly logger = new Logger(ScanAnalyzerService.name);

  constructor(
    @InjectModel(Scan.name) private scanModel: Model<Scan>,
    private readonly riskCalculator: RiskCalculatorService,
    private readonly permissionAnalyzer: PermissionAnalyzerService,
    private readonly heuristicDetector: HeuristicDetectorService,
    private readonly etipService: EtipService,
  ) {}


  async analyzeAndroidApps(
    apps: InstalledAppDto[],
    etipTrackers: EtipTracker[],
  ) {
    const analyzed = await Promise.all(
      apps.map((app) => this.analyzeAndroidApp(app, etipTrackers)),
    );

    return analyzed;
  }


  private async analyzeAndroidApp(
    app: InstalledAppDto,
    etipTrackers: EtipTracker[],
  ) {
    const packageName = app.packageName;
    this.logger.debug(`Analyzing Android app: ${packageName}`);

    try {
      const dangerousPermissions =
        this.permissionAnalyzer.getDangerousPermissions(app.permissions || []);
      const matchedTrackers = this.matchTrackersWithEtip(
        packageName,
        etipTrackers,
      );
      const trackerNames = matchedTrackers.map((t) => t.name);
      const heuristicFindings = this.heuristicDetector.detectAndroid(
        app,
        dangerousPermissions,
        matchedTrackers,
      );
      const riskResult = this.riskCalculator.calculateRiskScore({
        permissions: dangerousPermissions,
        trackers: trackerNames,
        isDebuggable: app.isDebuggable || false,
      });

      const riskLevel = this.riskCalculator.getRiskLevel(riskResult.score);
      return {
        packageName,
        name: app.name || packageName,
        version: app.version || 'unknown',
        permissions: app.permissions || [],
        dangerousPermissions,
        trackers: trackerNames,
        trackerDetails: matchedTrackers.map((t) => ({
          name: t.name,
          description: t.description,
          website: t.website,
        })),
        privacyScore: riskResult.score,
        riskLevel,
        riskBreakdown: riskResult.breakdown,
        alerts: [...riskResult.alerts, ...heuristicFindings],
        isDebuggable: app.isDebuggable || false,
      };
    } catch (error) {
      this.logger.error(
        `Failed to analyze ${packageName}: ${error.message}`,
        error.stack,
      );

      return {
        packageName,
        name: app.name || packageName,
        error: 'Analysis failed',
        privacyScore: 50,
        riskLevel: 'UNKNOWN',
        alerts: [],
      };
    }
  }

async analyzeIosApps(apps: IosAppDto[], etipTrackers: EtipTracker[]){
    const analyzed = await Promise.all(
      apps.map((app) => this.analyzeIosApp(app, etipTrackers)),
    );

    return analyzed;
  }
private async analyzeIosApp(
  app: IosAppDto,
  etipTrackers: EtipTracker[],
) {
  const bundleId = app.bundleId;
  const version = app.version || "unknown";

  this.logger.debug(`Analyzing iOS app: ${bundleId}`);

  try {
    const matchedTrackers = this.matchTrackersWithEtip(
      bundleId,
      etipTrackers,
    );

    const trackerNames = matchedTrackers.map((t) => t.name);

    const heuristicFindings = this.heuristicDetector.detectIos({
      name: app.name,
      bundleId,
      version,
    });

    const riskResult = this.riskCalculator.calculateRiskScore({
      permissions: [],
      trackers: trackerNames,
      isDebuggable: false,
    });

    const riskLevel = this.riskCalculator.getRiskLevel(riskResult.score);

    return {
      packageName: bundleId,
      name: app.name,
      version,
      trackers: trackerNames,
      trackerDetails: matchedTrackers.map((t) => ({
        name: t.name,
        description: t.description,
        website: t.website,
      })),
      privacyScore: riskResult.score,
      riskLevel,
      riskBreakdown: riskResult.breakdown,
      alerts: [...riskResult.alerts, ...heuristicFindings],
    };
  } catch (error) {
    this.logger.error(
      `Failed to analyze iOS app ${bundleId}: ${error.message}`,
      error.stack,
    );

    return {
      packageName: bundleId,
      name: app.name,
      error: 'Analysis failed',
      privacyScore: 50,
      riskLevel: 'UNKNOWN',
      alerts: [],
    };
  }
}


  private matchTrackersWithEtip(
    packageName: string,
    etipTrackers: EtipTracker[],
  ): EtipTracker[] {
    if (!packageName || !etipTrackers || etipTrackers.length === 0) {
      return [];
    }

    const matched: EtipTracker[] = [];
    const pkg = packageName.toLowerCase();

    for (const tracker of etipTrackers) {
      let isMatch = false;
      if (tracker.code_signature) {
        const codeSignatures = Array.isArray(tracker.code_signature)
          ? tracker.code_signature
          : [tracker.code_signature];

        for (const signature of codeSignatures) {
          if (signature && pkg.includes(signature.toLowerCase())) {
            isMatch = true;
            break;
          }
        }
      }
      if (!isMatch && tracker.network_signature) {
        const networkSignatures = Array.isArray(tracker.network_signature)
          ? tracker.network_signature
          : [tracker.network_signature];

        for (const signature of networkSignatures) {
          if (signature && pkg.includes(signature.toLowerCase())) {
            isMatch = true;
            break;
          }
        }
      }

      if (isMatch) {
        matched.push(tracker);
      }
    }

    this.logger.debug(
      `Matched ${matched.length} ETIP trackers for ${packageName}`,
    );
    return matched;
  }
}