import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { App, AppDocument } from './schemas/app.schema';
import { Tracker } from './schemas/tracker.schema';
import { PlayStoreService } from '../external-apis/play-store.service';
import { EtipService } from '../external-apis/etip.service';
import { RiskCalculatorService } from '../analysis/risk-calculator.service';

@Injectable()
export class AppRegistryService {
  private readonly logger = new Logger(AppRegistryService.name);

  constructor(
    @InjectModel(App.name) private appModel: Model<App>,
    @InjectModel(Tracker.name) private trackerModel: Model<Tracker>,
    private playStoreService: PlayStoreService,
    private etipService: EtipService, 
    private riskCalculator: RiskCalculatorService,
  ) { }

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
    const playStoreData = await this.playStoreService.getAppDetails(packageName);
    const etipTrackers = await this.etipService.getAllTrackers();
    const matchedTrackers = this.matchTrackersForPackage(packageName, etipTrackers);
    const trackerNames = matchedTrackers.map((t) => t.name);
    const permissionsRaw = await this.playStoreService.getPermissions(packageName);
    const permissions = this.extractPermissionNames(permissionsRaw);
    const app = new this.appModel({
      packageName,
      name: playStoreData?.name || packageName,
      developer: playStoreData?.developer || '',
      category: playStoreData?.category || '',
      version: playStoreData?.version || '',
      iconUrl: playStoreData?.iconUrl || '',
      description: playStoreData?.description || '',
      rating: playStoreData?.rating || 0,       
      installs: playStoreData?.installs || '',   
      permissions: permissions,
      trackers: trackerNames,
      playStoreData,
      lastUpdated: new Date(),
    });
    const riskResult = this.riskCalculator.calculateRiskScore({
      permissions: app.permissions,
      trackers: trackerNames,
      isDebuggable: false,
    });

    app.privacyScore = riskResult.score;
    app.riskLevel = this.riskCalculator.getRiskLevel(riskResult.score);

    return app.save();
  }

  private extractPermissionNames(permissionsRaw: any): string[] {
    if (!permissionsRaw || !Array.isArray(permissionsRaw)) {
      return [];
    }

    if (typeof permissionsRaw[0] === 'string') {
      return permissionsRaw;
    }
    return permissionsRaw.map((p: any) => {
      if (typeof p === 'string') return p;
      return p.type || p.permission || p.name || '';
    }).filter(Boolean);
  }

  private shouldRefresh(app: AppDocument): boolean {
    const daysSinceUpdate =
      (Date.now() - app.lastUpdated.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceUpdate > 7; // Refresh si > 7 jours
  }


  private async refreshAppData(app: AppDocument): Promise<AppDocument> {
    const playStoreData = await this.playStoreService.getAppDetails(
      app.packageName,
    );
    const etipTrackers = await this.etipService.getAllTrackers();
    const matchedTrackers = this.matchTrackersForPackage(
      app.packageName,
      etipTrackers,
    );
    const trackerNames = matchedTrackers.map((t) => t.name);
    const permissionsRaw = await this.playStoreService.getPermissions(
      app.packageName,
    );
    const permissions = this.extractPermissionNames(permissionsRaw);

    if (playStoreData) {
      app.playStoreData = playStoreData;
      app.version = playStoreData.version;
      app.rating = playStoreData.rating || 0;     
      app.installs = playStoreData.installs || ''; 
    }
    app.trackers = trackerNames;
    app.permissions = permissions.length > 0 ? permissions : app.permissions;
    app.lastUpdated = new Date();

    const riskResult = this.riskCalculator.calculateRiskScore({
      permissions: app.permissions,
      trackers: trackerNames,
      isDebuggable: app.isDebuggable || false,
    });

    app.privacyScore = riskResult.score;
    app.riskLevel = this.riskCalculator.getRiskLevel(riskResult.score); 

    return app.save();
  }


  private matchTrackersForPackage(
    packageName: string,
    etipTrackers: any[],
  ): any[] {
    const lowerPkg = packageName.toLowerCase();

    return etipTrackers.filter((t) => {
      const codeSig = t.code_signature?.toLowerCase() ?? '';
      const netSig = t.network_signature?.toLowerCase() ?? '';

      const matchesCode = !!codeSig && lowerPkg.includes(codeSig);
      const matchesNet = !!netSig && lowerPkg.includes(netSig);

      return matchesCode || matchesNet;
    });
  }

 
  async searchApps(query: string, limit: number = 10) {
 
    const dbResults = await this.appModel
      .find({
        $or: [
          { packageName: { $regex: query, $options: 'i' } },
          { name: { $regex: query, $options: 'i' } },
          { developer: { $regex: query, $options: 'i' } },
        ],
      })
      .limit(limit)
      .sort({ privacyScore: -1 })
      .exec();

    if (dbResults.length >= limit) {
      return dbResults;
    }
    try {
      const playStoreResults = await this.playStoreService.searchApp(
        query,
        limit - dbResults.length,
      );

      const newApps = await Promise.all(
        playStoreResults.map((result) => this.getOrCreateApp(result.appId)),
      );

      return [...dbResults, ...newApps];
    } catch (error) {
      this.logger.warn(`Play Store search failed: ${error.message}`);
      return dbResults;
    }
  }

  async updateAppScore(packageName: string, factors: any) {
    const app = await this.appModel.findOne({ packageName });
    if (!app) return null;

    const riskResult = this.riskCalculator.calculateRiskScore(factors);
    app.privacyScore = riskResult.score;
    app.riskLevel = this.riskCalculator.getRiskLevel(riskResult.score);
    app.lastUpdated = new Date();

    return app.save();
  }
  async getTopSafeApps(limit: number = 10) {
    return this.appModel
      .find()
      .sort({ privacyScore: -1 }) // Score élevé = sûr
      .limit(limit)
      .select('packageName name developer iconUrl privacyScore riskLevel trackers')
      .exec();
  }

  async getTopDangerousApps(limit: number = 10) {
    return this.appModel
      .find()
      .sort({ privacyScore: 1 }) // Score faible = dangereux
      .limit(limit)
      .select('packageName name developer iconUrl privacyScore riskLevel trackers')
      .exec();
  }

  async getStats() {
    const total = await this.appModel.countDocuments();

    const riskDistribution = await this.appModel.aggregate([
      { $group: { _id: '$riskLevel', count: { $sum: 1 } } },
    ]);

    const avgScore = await this.appModel.aggregate([
      { $group: { _id: null, avg: { $avg: '$privacyScore' } } },
    ]);

    return {
      totalApps: total,
      avgPrivacyScore: avgScore[0]?.avg || 0,
      riskDistribution,
    };
  }
}