import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { App } from '../app-registry/schemas/app.schema';
import { Alert } from '../alerts/alert.schema';
import { PrivacyTip } from '../privacy-tips/schemas/privacy-tip.schema';
import {
  SearchQueryDto,
  SearchResponseDto,
  SearchResultsDto,
  AppSearchResultDto,
  AlertSearchResultDto,
  TipSearchResultDto,
  SearchType,
} from './dto/search.dto';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    @InjectModel(App.name) private appModel: Model<App>,
    @InjectModel(Alert.name) private alertModel: Model<Alert>,
    @InjectModel(PrivacyTip.name) private tipModel: Model<PrivacyTip>,
  ) {}

  async search(
    userId: string,
    query: SearchQueryDto,
  ): Promise<SearchResponseDto> {
    try {
      const searchQuery = query.query.trim();
      const type = query.type || SearchType.ALL;
      const limit = Math.min(query.limit || 20, 50);
      const offset = query.offset || 0;

      // Case-insensitive regex
      const regex = new RegExp(searchQuery, 'i');

      const results: SearchResultsDto = {
        apps: [],
        alerts: [],
        tips: [],
      };

      // Search apps
      if (type === SearchType.ALL || type === SearchType.APPS) {
        const appResults = await this.searchApps(regex, limit);
        results.apps = appResults;
      }

      // Search alerts (user-specific)
      if (type === SearchType.ALL || type === SearchType.ALERTS) {
        const alertResults = await this.searchAlerts(userId, regex, limit);
        results.alerts = alertResults;
      }

      // Search tips
      if (type === SearchType.ALL || type === SearchType.TIPS) {
        const tipResults = await this.searchTips(regex, limit);
        results.tips = tipResults;
      }

      // Calculate totals
      const total =
        results.apps.length + results.alerts.length + results.tips.length;

      return {
        query: searchQuery,
        results,
        pagination: {
          total,
          limit,
          offset,
          hasMore: total > offset + limit,
        },
      };
    } catch (error) {
      this.logger.error('Search failed', error);
      throw new Error(`Search failed: ${error.message}`);
    }
  }

  private async searchApps(
    regex: RegExp,
    limit: number,
  ): Promise<AppSearchResultDto[]> {
    const apps = await this.appModel
      .find({
        $or: [{ name: regex }, { packageName: regex }, { developer: regex }],
      })
      .limit(limit)
      .lean()
      .exec();

    return apps.map((app) => {
      let matchType: 'name' | 'package' | 'permission' = 'name';
      if (regex.test(app.packageName)) {
        matchType = 'package';
      } else if (regex.test(app.name)) {
        matchType = 'name';
      }

      return {
        packageName: app.packageName,
        name: app.name,
        icon: (app as any).iconUrl || (app as any).icon,
        riskLevel: app.riskLevel || 'unknown',
        matchType,
      };
    });
  }

  private async searchAlerts(
    userId: string,
    regex: RegExp,
    limit: number,
  ): Promise<AlertSearchResultDto[]> {
    const alerts = await this.alertModel
      .find({
        userId,
        $or: [{ event: regex }, { packageName: regex }],
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();

    return alerts.map((alert) => {
      const alertDoc = alert as any;
      return {
        id: String(alert._id),
        title: `${alert.packageName} — ${alert.event}`,
        appName: alert.packageName,
        severity: alert.severity || 'info',
        timestamp:
          alert.timestamp ||
          (alertDoc.createdAt
            ? new Date(alertDoc.createdAt).getTime()
            : Date.now()),
      };
    });
  }

  private async searchTips(
    regex: RegExp,
    limit: number,
  ): Promise<TipSearchResultDto[]> {
    const tips = await this.tipModel
      .find({
        $or: [{ title: regex }, { content: regex }, { category: regex }],
      })
      .limit(limit)
      .lean()
      .exec();

    return tips.map((tip) => {
      const content = (tip as any).content || (tip as any).description || '';
      const excerpt =
        content.substring(0, 150) + (content.length > 150 ? '...' : '');

      return {
        id: String(tip._id),
        title: (tip as any).title || 'Privacy Tip',
        category: (tip as any).category || 'general',
        excerpt,
      };
    });
  }
}
