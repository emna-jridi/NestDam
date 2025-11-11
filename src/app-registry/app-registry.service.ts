import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { App, AppDocument } from './schemas/app.schema';
import { Tracker } from './schemas/tracker.schema';
import { ExodusPrivacyService } from '../external-apis/exodus-privacy.service';
import { PlayStoreService } from '../external-apis/play-store.service';
import { RiskCalculatorService } from '../analysis/risk-calculator.service';

@Injectable()
export class AppRegistryService {
  private readonly logger = new Logger(AppRegistryService.name);

  constructor(
    @InjectModel(App.name) private appModel: Model<App>,
    @InjectModel(Tracker.name) private trackerModel: Model<Tracker>,
    private exodusService: ExodusPrivacyService,
    private playStoreService: PlayStoreService,
    private riskCalculator: RiskCalculatorService,
  ) {}

  // Récupérer ou créer une app dans la base
  async getOrCreateApp(packageName: string): Promise<AppDocument> {
    let app = await this.appModel.findOne({ packageName });

    if (!app) {
      this.logger.log(`Creating new app entry: ${packageName}`);
      app = await this.createAppEntry(packageName);
    } else if (this.shouldRefresh(app)) {
      this.logger.log(`Refreshing app data: ${packageName}`);
      app = await this.refreshAppData(app);
    }

    return app;
  }

  private async createAppEntry(packageName: string): Promise<AppDocument> {
    // Récupérer données de multiple sources
    const [exodusData, playStoreData] = await Promise.all([
      this.exodusService.analyzeApp(packageName),
      this.playStoreService.getAppDetails(packageName),
    ]);

    const app = new this.appModel({
      packageName,
      name: playStoreData?.name || exodusData?.name || packageName,
      developer: playStoreData?.developer || '',
      category: playStoreData?.category || '',
      version: exodusData?.version || playStoreData?.version || '',
      iconUrl: playStoreData?.iconUrl || '',
      description: playStoreData?.description || '',
      permissions: exodusData?.permissions || [],
      trackers: exodusData?.trackers || [],
      exodusData,
      playStoreData,
      lastUpdated: new Date(),
    });

    // Calculer score initial
    const riskResult = this.riskCalculator.calculateRiskScore({
      permissions: app.permissions,
      trackers: app.trackers,
      isDebuggable: false, // On ne sait pas encore
    });

    app.privacyScore = riskResult.score;

    return app.save();
  }

  private shouldRefresh(app: AppDocument): boolean {
    const daysSinceUpdate =
      (Date.now() - app.lastUpdated.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceUpdate > 7; // Refresh si > 7 jours
  }

  private async refreshAppData(app: AppDocument): Promise<AppDocument> {
    const [exodusData, playStoreData] = await Promise.all([
      this.exodusService.analyzeApp(app.packageName),
      this.playStoreService.getAppDetails(app.packageName),
    ]);

    if (exodusData) {
      app.exodusData = exodusData;
      app.trackers = exodusData.trackers || [];
      app.permissions = exodusData.permissions || [];
    }

    if (playStoreData) {
      app.playStoreData = playStoreData;
      app.version = playStoreData.version;
    }

    app.lastUpdated = new Date();

    // Recalculer score
    const riskResult = this.riskCalculator.calculateRiskScore({
      permissions: app.permissions,
      trackers: app.trackers,
      isDebuggable: app.isDebuggable,
    });

    app.privacyScore = riskResult.score;

    return app.save();
  }

  // Rechercher des apps
  async searchApps(query: string, limit: number = 10) {
    // Recherche en base
    const dbResults = await this.appModel
      .find({ $text: { $search: query } })
      .limit(limit)
      .sort({ privacyScore: -1 })
      .exec();

    if (dbResults.length >= limit) {
      return dbResults;
    }

    // Compléter avec Play Store
    const playStoreResults = await this.playStoreService.searchApp(
      query,
      limit - dbResults.length,
    );

    const newApps = await Promise.all(
      playStoreResults.map((result) => this.getOrCreateApp(result.appId)),
    );

    return [...dbResults, ...newApps];
  }

  // Mettre à jour le score d'une app
  async updateAppScore(packageName: string, factors: any) {
    const app = await this.appModel.findOne({ packageName });
    if (!app) return null;

    const riskResult = this.riskCalculator.calculateRiskScore(factors);
    app.privacyScore = riskResult.score;
    app.lastUpdated = new Date();

    return app.save();
  }
}
