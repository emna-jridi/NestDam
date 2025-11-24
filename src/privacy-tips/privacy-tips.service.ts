import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, Document } from 'mongoose';
import { PrivacyTip, PrivacyTipDocument } from './schemas/privacy-tip.schema';
import {
  PersonalizedTipCache,
  PersonalizedTipCacheDocument,
} from './schemas/personalized-tip-cache.schema';
import { AITipGeneratorService } from './services/ai-tip-generator.service';
import { UsersService } from '../user-management/services/users.service';
import { Device } from '../devices/schemas/device.schema';
import { DeviceScan } from '../devices/schemas/device-scan.schema';
import { App } from '../app-registry/schemas/app.schema';

interface TipQuery {
  isActive: boolean;
  category?: string;
}

interface UserDataSummary {
  userId: string;
  email: string;
  privacyScore: number;
  totalScans: number;
  riskyApps: number;
  highRiskApps: number;
  totalApps: number;
  deviceCount: number;
  topRiskyApps: Array<{
    name: string;
    packageName: string;
    privacyScore: number;
    permissions: string[];
    trackers: number;
  }>;
  permissionStats: Record<string, number>;
  appData: {
    riskyApps: number;
    recentAlerts: number;
    totalApps: number;
  };
  scanData: {
    totalScans: number;
    lastScanDate: string | null;
    averageRiskScore: number;
  };
  [key: string]: unknown;
}

interface CachedDocument extends PersonalizedTipCacheDocument {
  createdAt?: Date;
}

@Injectable()
export class PrivacyTipsService {
  private readonly logger = new Logger(PrivacyTipsService.name);

  constructor(
    @InjectModel(PrivacyTip.name)
    private tipModel: Model<PrivacyTipDocument>,
    @InjectModel(PersonalizedTipCache.name)
    private cacheModel: Model<PersonalizedTipCacheDocument>,
    @InjectModel(Device.name)
    private deviceModel: Model<Device>,
    @InjectModel(DeviceScan.name)
    private deviceScanModel: Model<DeviceScan>,
    @InjectModel(App.name)
    private appModel: Model<App>,
    private aiTipGenerator: AITipGeneratorService,
    private usersService: UsersService,
  ) {}

  async findAll(filters: {
    category?: string;
    limit?: number;
    offset?: number;
  }) {
    this.logger.debug(
      `🔍 Finding tips with filters: ${JSON.stringify(filters)}`,
    );
    const query: TipQuery = { isActive: true };

    if (filters.category) {
      query.category = filters.category;
      this.logger.debug(`Filtering by category: ${filters.category}`);
    }

    const limit = filters.limit || 20;
    const offset = filters.offset || 0;

    const tips = await this.tipModel
      .find(query)
      .limit(limit)
      .skip(offset)
      .sort({ priority: -1, createdAt: -1 })
      .exec();

    const total = await this.tipModel.countDocuments(query);

    this.logger.log(
      `✅ Found ${tips.length} tips (total: ${total}, offset: ${offset})`,
    );

    return {
      tips,
      total,
      hasMore: offset + tips.length < total,
    };
  }

  async getDailyTip() {
    const date = new Date().toISOString().split('T')[0];

    // Get tip for today (rotate based on date)
    const dayOfYear = Math.floor(
      (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) /
        86400000,
    );

    this.logger.debug(
      `📅 Getting daily tip for day ${dayOfYear} of year (date: ${date})`,
    );

    const tips = await this.tipModel
      .find({ isActive: true })
      .sort({ priority: -1, createdAt: -1 })
      .exec();

    if (tips.length === 0) {
      this.logger.error('❌ No tips available in database');
      throw new NotFoundException('No tips available');
    }

    const tipIndex = dayOfYear % tips.length;
    const tip = tips[tipIndex];

    this.logger.log(
      `✅ Daily tip selected: "${tip.title}" (index: ${tipIndex}/${tips.length})`,
    );

    return {
      tip,
      date,
    };
  }

  async getPersonalizedTips(userId: string, forceRegenerate: boolean = false) {
    // Check cache first (unless forceRegenerate is true)
    if (!forceRegenerate) {
      const cached = await this.cacheModel
        .findOne({
          userId: new Types.ObjectId(userId),
          expiresAt: { $gt: new Date() },
        })
        .populate('tipIds')
        .exec();

      if (cached && cached.tipIds && cached.tipIds.length > 0) {
        this.logger.log(
          `✅ Returning cached personalized tips for user ${userId} (expires: ${cached.expiresAt.toISOString()})`,
        );

        // Format tips with metadata
        const cachedDoc = cached.toObject
          ? (cached.toObject() as CachedDocument)
          : (cached as CachedDocument);
        const generatedAt =
          cached.generatedAt || cachedDoc.createdAt || new Date();
        const generatedAtDate =
          generatedAt instanceof Date ? generatedAt : new Date(generatedAt);

        const tips = cached.tipIds
          .filter((tip) => {
            return (
              tip !== null &&
              tip !== undefined &&
              typeof tip === 'object' &&
              '_id' in tip &&
              'toObject' in tip &&
              typeof (tip as { toObject?: () => unknown }).toObject ===
                'function'
            );
          })
          .map((tip) => {
            const tipDoc = tip as unknown as PrivacyTipDocument;
            const tipObj = tipDoc.toObject();
            return {
              ...tipObj,
              personalized: true,
              aiModel: cached.aiModel || 'gemini-pro',
              generationId: cached.generationId || 'unknown',
              generationTimestamp: generatedAtDate.toISOString(),
              dataUsed: [
                'user_profile',
                'scan_history',
                'app_permissions',
                'device_information',
              ],
            };
          });

        return {
          tips,
          generatedAt: generatedAtDate,
          expiresAt: cached.expiresAt,
          aiModel: cached.aiModel || 'gemini-pro',
          generationId: cached.generationId || 'unknown',
          forceRegenerate: false,
        };
      }
    } else {
      this.logger.log(
        `🔄 Force regenerate requested for user ${userId}, bypassing cache`,
      );
    }

    // Generate new personalized tips
    this.logger.log(`🔄 Generating new personalized tips for user ${userId}`);

    // Step 1: Collect comprehensive user data
    this.logger.debug(`📊 Collecting user data for ${userId}...`);
    const userDataSummary = await this.collectUserData(userId);
    this.logger.debug(
      `✅ User data collected: ${JSON.stringify(Object.keys(userDataSummary))}`,
    );

    // Step 2: Generate tips with AI
    this.logger.debug('🤖 Calling AI tip generator...');
    const aiResult =
      await this.aiTipGenerator.generatePersonalizedTips(userDataSummary);
    this.logger.log(
      `✅ AI generated ${aiResult.tips.length} tip(s) with generation ID: ${aiResult.generationId}`,
    );

    // Step 3: Create tip documents
    this.logger.debug('💾 Saving tips to database...');
    const tipDocuments = await Promise.all(
      aiResult.tips.map(async (tipData) => {
        const tip = await this.tipModel.create({
          title: tipData.title,
          content: tipData.content,
          category: tipData.category,
          priority: tipData.priority,
          aiGenerated: true,
          isActive: true,
          actionable: true,
          icon: this.getIconForCategory(tipData.category),
        });
        return tip;
      }),
    );
    this.logger.log(`✅ Saved ${tipDocuments.length} tip(s) to database`);

    // Step 4: Cache the tips (24 hours)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    this.logger.debug(
      `💾 Caching tips for 24 hours (expires: ${expiresAt.toISOString()})...`,
    );

    const tipIds = tipDocuments.map((tip) => tip._id);

    await this.cacheModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId) },
      {
        userId: new Types.ObjectId(userId),
        tipIds,
        expiresAt,
        aiModel: this.aiTipGenerator.modelName || 'gemini-pro',
        generationId: aiResult.generationId,
        prompt: aiResult.prompt,
        tokensUsed: aiResult.tokensUsed,
        dataSummary: userDataSummary,
        generatedAt: new Date(aiResult.generationTimestamp),
      },
      { upsert: true, new: true },
    );
    this.logger.log(`✅ Tips cached successfully for user ${userId}`);

    // Step 5: Format response with metadata
    const aiModel = this.aiTipGenerator.modelName || 'gemini-pro';
    const tips = tipDocuments.map((tip, index) => {
      const tipData = aiResult.tips[index];
      return {
        ...tip.toObject(),
        personalized: true,
        basedOn: tipData.basedOn || 'user_data',
        recommendation: tipData.recommendation,
        aiModel,
        generationId: aiResult.generationId,
        generationTimestamp: aiResult.generationTimestamp,
        dataUsed: [
          'user_profile',
          'scan_history',
          'app_permissions',
          'device_information',
        ],
      };
    });

    return {
      tips,
      generatedAt: new Date(aiResult.generationTimestamp),
      expiresAt,
      aiModel,
      generationId: aiResult.generationId,
      forceRegenerate,
    };
  }

  private async collectUserData(userId: string): Promise<UserDataSummary> {
    try {
      // 1. User Profile
      const user = await this.usersService.getUserById(userId);

      // 2. Device Information
      const devices = await this.deviceModel
        .find({ userId: new Types.ObjectId(userId) })
        .exec();

      // 3. Scan History (last 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const scanHistory = await this.deviceScanModel
        .find({
          uploadedBy: new Types.ObjectId(userId),
          scannedAt: { $gte: thirtyDaysAgo },
        })
        .sort({ scannedAt: -1 })
        .exec();

      // 4. Extract app data from scans
      const allApps: Array<{
        packageName: string;
        riskLevel?: string;
        issues?: string[];
      }> = [];
      scanHistory.forEach((scan) => {
        if (scan.apps && Array.isArray(scan.apps)) {
          allApps.push(...scan.apps);
        }
      });

      // 5. Get app details from registry
      const packageNames = [...new Set(allApps.map((app) => app.packageName))];
      const apps = await this.appModel
        .find({ packageName: { $in: packageNames } })
        .exec();

      // 6. Calculate statistics
      const riskyApps = allApps.filter(
        (app) => app.riskLevel === 'high' || app.riskLevel === 'critical',
      );
      const highRiskApps = apps.filter((app) => app.privacyScore < 50);

      // 7. Permission statistics
      const allPermissions = apps.flatMap((app) => app.permissions || []);
      const permissionStats = {
        location: allPermissions.filter((p) =>
          p.toLowerCase().includes('location'),
        ).length,
        camera: allPermissions.filter((p) => p.toLowerCase().includes('camera'))
          .length,
        contacts: allPermissions.filter((p) =>
          p.toLowerCase().includes('contact'),
        ).length,
        microphone: allPermissions.filter(
          (p) =>
            p.toLowerCase().includes('microphone') ||
            p.toLowerCase().includes('record_audio'),
        ).length,
        sms: allPermissions.filter((p) => p.toLowerCase().includes('sms'))
          .length,
        storage: allPermissions.filter((p) =>
          p.toLowerCase().includes('storage'),
        ).length,
      };

      // 8. Calculate average privacy score
      const privacyScores = apps
        .map((app) => app.privacyScore)
        .filter((score) => score !== undefined && score !== null);
      const averagePrivacyScore =
        privacyScores.length > 0
          ? Math.round(
              privacyScores.reduce((sum, score) => sum + score, 0) /
                privacyScores.length,
            )
          : 0;

      // 9. Top risky apps
      const topRiskyApps = highRiskApps.slice(0, 5).map((app) => ({
        name: app.name,
        packageName: app.packageName,
        privacyScore: app.privacyScore,
        permissions: app.permissions?.slice(0, 5) || [],
        trackers: app.trackers?.length || 0,
      }));

      // 10. Build comprehensive summary
      const userDataSummary: UserDataSummary = {
        userId: userId,
        email: user.email || '',
        privacyScore: averagePrivacyScore,
        totalScans: scanHistory.length,
        riskyApps: riskyApps.length,
        highRiskApps: highRiskApps.length,
        totalApps: apps.length,
        deviceCount: devices.length,
        topRiskyApps,
        permissionStats,
        appData: {
          riskyApps: riskyApps.length,
          recentAlerts: 0,
          totalApps: apps.length,
        },
        scanData: {
          totalScans: scanHistory.length,
          lastScanDate:
            scanHistory.length > 0
              ? scanHistory[0].scannedAt.toISOString()
              : null,
          averageRiskScore:
            scanHistory.length > 0
              ? Math.round(
                  scanHistory.reduce(
                    (sum, scan) => sum + (scan.riskScore || 0),
                    0,
                  ) / scanHistory.length,
                )
              : 0,
        },
      };

      this.logger.debug(
        `📊 Collected data: ${userDataSummary.totalApps} apps, ${userDataSummary.riskyApps} risky, ${userDataSummary.totalScans} scans`,
      );

      return userDataSummary;
    } catch (error) {
      this.logger.warn(
        `⚠️  Error collecting user data for ${userId}, using minimal context`,
        error instanceof Error ? error.message : String(error),
      );
      // Return minimal data if collection fails
      const user = await this.usersService
        .getUserById(userId)
        .catch(() => null);
      const minimalData: UserDataSummary = {
        userId: userId,
        email: user?.email || 'unknown',
        privacyScore: 0,
        totalScans: 0,
        riskyApps: 0,
        highRiskApps: 0,
        totalApps: 0,
        deviceCount: 0,
        topRiskyApps: [],
        permissionStats: {},
        appData: {
          riskyApps: 0,
          recentAlerts: 0,
          totalApps: 0,
        },
        scanData: {
          totalScans: 0,
          lastScanDate: null,
          averageRiskScore: 0,
        },
      };
      return minimalData;
    }
  }

  private getIconForCategory(category: string): string {
    const icons: Record<string, string> = {
      permissions: 'lock.shield',
      data_protection: 'shield.checkered',
      app_security: 'app.badge',
      general: 'info.circle',
    };
    return icons[category] || 'info.circle';
  }
}
