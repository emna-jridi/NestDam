import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Scan } from '../schemas/scan.schema';
import { GetScansQueryDto, GetScansResponseDto, SortOrder } from '../dto/get-scans.dto';

@Injectable()
export class ScanStatisticsService {
  private readonly logger = new Logger(ScanStatisticsService.name);

  constructor(
    @InjectModel(Scan.name) private scanModel: Model<Scan>,
  ) {}

  async getUserScans(
    userHash: string,
    options: GetScansQueryDto,
  ): Promise<GetScansResponseDto> {
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

      const total = await this.scanModel.countDocuments(filter);
      const skip = (page - 1) * limit;
      const totalPages = Math.ceil(total / limit);

      const scans = await this.scanModel
        .find(filter)
        .sort({ createdAt: sortOrder === SortOrder.DESC ? -1 : 1 })
        .skip(skip)
        .limit(limit)
        .select('-__v')
        .lean()
        .exec();

      this.logger.log(
        ` Found ${scans.length} scans (page ${page}/${totalPages})`,
      );

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
      this.logger.error('Get user scans failed', error.stack);
      throw new Error(`Failed to get user scans: ${error.message}`);
    }
  }


  async calculateUserStats(userHash: string): Promise<{
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

      const totalApps = scans.reduce(
        (sum, scan) => sum + (scan.totalApps || 0),
        0,
      );
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
      this.logger.error('Calculate stats failed', error.stack);
      return null;
    }
  }

  /**
   * Récupère les statistiques détaillées avec évolution
   */
  async getStatistics(userHash: string) {
    try {
      this.logger.log(` Getting statistics for: ${userHash}`);

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

      const scoreEvolution = scans.map((scan) => ({
        date: scan.createdAt,
        avgScore: scan.summary?.avgScore || 0,
        scanId: scan._id.toString(),
      }));

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
        scoreEvolution: scoreEvolution.reverse(),
        appsEvolution: appsEvolution.reverse(),
      };
    } catch (error) {
      this.logger.error(' Get statistics failed', error.stack);
      throw new Error(`Failed to get statistics: ${error.message}`);
    }
  }
}