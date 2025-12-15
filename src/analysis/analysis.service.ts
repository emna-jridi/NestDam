import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Scan } from '../scan/schemas/scan.schema';
import { PermissionAnalyzerService } from './permission-analyzer.service';
import {
  PermissionAnalyticsResponseDto,
  DangerousPermissionDto,
  PermissionUsageDto,
} from './dto/permission-analytics.dto';

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);

  // Dangerous permissions list
  private readonly dangerousPermissions = [
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.CAMERA',
    'android.permission.RECORD_AUDIO',
    'android.permission.READ_CONTACTS',
    'android.permission.WRITE_CONTACTS',
    'android.permission.READ_SMS',
    'android.permission.SEND_SMS',
    'android.permission.READ_PHONE_STATE',
    'android.permission.CALL_PHONE',
    'android.permission.READ_EXTERNAL_STORAGE',
    'android.permission.WRITE_EXTERNAL_STORAGE',
    'android.permission.READ_CALENDAR',
    'android.permission.WRITE_CALENDAR',
  ];

  private readonly permissionCategories: Record<string, string> = {
    'android.permission.ACCESS_FINE_LOCATION': 'location',
    'android.permission.ACCESS_COARSE_LOCATION': 'location',
    'android.permission.CAMERA': 'media',
    'android.permission.RECORD_AUDIO': 'media',
    'android.permission.READ_CONTACTS': 'communication',
    'android.permission.WRITE_CONTACTS': 'communication',
    'android.permission.READ_SMS': 'communication',
    'android.permission.SEND_SMS': 'communication',
    'android.permission.READ_PHONE_STATE': 'communication',
    'android.permission.CALL_PHONE': 'communication',
    'android.permission.READ_EXTERNAL_STORAGE': 'storage',
    'android.permission.WRITE_EXTERNAL_STORAGE': 'storage',
    'android.permission.READ_CALENDAR': 'personal',
    'android.permission.WRITE_CALENDAR': 'personal',
  };

  constructor(
    @InjectModel(Scan.name) private scanModel: Model<Scan>,
    private permissionAnalyzer: PermissionAnalyzerService,
  ) {}

  async getPermissionAnalytics(
    userId: string,
    platform?: 'android' | 'ios',
    days: number = 30,
  ): Promise<PermissionAnalyticsResponseDto> {
    try {
      // Calculate date filter
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - days);

      // Get all scans for user
      const filter: any = { userHash: userId };
      if (platform) {
        // Filter by platform if specified (would need platform field in scan)
        // For now, we'll analyze all scans
      }
      filter.createdAt = { $gte: daysAgo };

      const scans = await this.scanModel
        .find(filter)
        .sort({ createdAt: -1 })
        .lean()
        .exec();

      // Aggregate permissions from all scans
      const permissionMap = new Map<
        string,
        {
          apps: Set<string>;
          appNames: Map<string, string>;
          lastUsed: Date;
          usageCount: number;
        }
      >();

      // Get latest scan for each app to get current permission state
      const appLatestScan = new Map<string, any>();

      scans.forEach((scan) => {
        const results = scan.report?.results || [];
        results.forEach((app: any) => {
          const packageName = app.packageName;
          if (!appLatestScan.has(packageName)) {
            appLatestScan.set(packageName, app);
          } else {
            const existing = appLatestScan.get(packageName);
            const scanDate = new Date(scan.createdAt as Date);
            const existingDate = new Date(
              existing.scanDate || existing.createdAt || 0,
            );
            if (scanDate > existingDate) {
              appLatestScan.set(packageName, app);
            }
          }
        });
      });

      // Process permissions from latest scan for each app
      appLatestScan.forEach((app) => {
        const permissions = app.permissions || [];
        const packageName = app.packageName;
        const appName = app.name || app.appName || packageName;

        permissions.forEach((perm: string) => {
          if (!permissionMap.has(perm)) {
            permissionMap.set(perm, {
              apps: new Set(),
              appNames: new Map(),
              lastUsed: new Date(),
              usageCount: 0,
            });
          }

          const permData = permissionMap.get(perm)!;
          permData.apps.add(packageName);
          permData.appNames.set(packageName, appName);
          permData.usageCount += 1;
        });
      });

      // Build dangerous permissions list
      const dangerousPerms: DangerousPermissionDto[] = this.dangerousPermissions
        .filter((perm) => permissionMap.has(perm))
        .map((perm) => {
          const data = permissionMap.get(perm)!;
          const appCount = data.apps.size;
          const category = this.permissionCategories[perm] || 'other';

          // Determine risk level based on app count
          let riskLevel: 'critical' | 'high' | 'medium' | 'low' = 'low';
          if (appCount >= 10) {
            riskLevel = 'critical';
          } else if (appCount >= 5) {
            riskLevel = 'high';
          } else if (appCount >= 2) {
            riskLevel = 'medium';
          }

          // Get permission info from permissions database
          // Access the permissionsDatabase through analyzePermissions which returns permission info
          const permAnalysis = this.permissionAnalyzer.analyzePermissions([
            perm,
          ]);
          const permInfo = permAnalysis.permissions[0];

          return {
            permission: perm,
            displayName:
              permInfo?.displayName ||
              perm.replace('android.permission.', '').replace(/_/g, ' '),
            appCount,
            riskLevel,
            category,
            description: permInfo?.description || 'Permission description',
          };
        })
        .sort((a, b) => b.appCount - a.appCount);

      // Build permission usage list
      const permissionUsage: PermissionUsageDto[] = Array.from(
        permissionMap.entries(),
      )
        .map(([perm, data]) => {
          const apps = Array.from(data.apps).map((pkg) => ({
            packageName: pkg,
            appName: data.appNames.get(pkg) || pkg,
            usageCount: 1, // Each app uses it once in latest scan
          }));

          return {
            permission: perm,
            usageCount: data.usageCount,
            lastUsed: data.lastUsed.toISOString(),
            apps,
          };
        })
        .sort((a, b) => b.usageCount - a.usageCount);

      // Calculate summary
      const totalDangerousPermissions = dangerousPerms.length;
      const totalAppsWithDangerousPermissions = new Set(
        dangerousPerms.flatMap((p) => {
          const data = permissionMap.get(p.permission);
          return data ? Array.from(data.apps) : [];
        }),
      ).size;

      const mostUsedPermission =
        permissionUsage.length > 0 ? permissionUsage[0].permission : '';

      const totalApps = appLatestScan.size;
      const totalPermissions = permissionMap.size;
      const averagePermissionsPerApp =
        totalApps > 0
          ? Math.round((totalPermissions / totalApps) * 10) / 10
          : 0;

      return {
        dangerousPermissions: dangerousPerms,
        permissionUsage: permissionUsage.slice(0, 20), // Top 20
        summary: {
          totalDangerousPermissions,
          totalAppsWithDangerousPermissions,
          mostUsedPermission,
          averagePermissionsPerApp,
        },
      };
    } catch (error) {
      this.logger.error('Get permission analytics failed', error);
      throw new Error(`Failed to get permission analytics: ${error.message}`);
    }
  }
}
