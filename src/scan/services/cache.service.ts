import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { ScanCache } from '../entities';
import { ScanUtils } from '../utils';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly TTL_MAP = {
    FAST: 7 * 24 * 60 * 60, // 7 days
    SMART: 3 * 24 * 60 * 60, // 3 days
    DEEP: 1 * 24 * 60 * 60, // 1 day
  };

  constructor(
    @InjectModel(ScanCache.name) private cacheModel: Model<ScanCache>,
  ) {}

  /**
   * Get cache key from packageName, versionCode, level
   */
  private getCacheKey(packageName: string, versionCode: string, level: string): string {
    return ScanUtils.calculateCacheKey(packageName, versionCode, level);
  }

  /**
   * Get cached scan result
   */
  async getFromCache(packageName: string, versionCode: string, level: string): Promise<any | null> {
    const cacheKey = this.getCacheKey(packageName, versionCode, level);

    try {
      const cached = await this.cacheModel.findOne({ cacheKey }).lean();

      if (cached && !cached.isStale) {
        this.logger.debug(`Cache hit for ${packageName}:${versionCode}:${level}`);
        return cached.scanResult;
      }

      if (cached && cached.isStale) {
        // Mark as stale but return for user info
        return null;
      }

      return null;
    } catch (error) {
      this.logger.warn(`Cache retrieval failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Cache scan result
   */
  async cacheResult(
    scanId: string,
    packageName: string,
    versionCode: string,
    level: string,
  ): Promise<void> {
    const cacheKey = this.getCacheKey(packageName, versionCode, level);

    try {
      // Get scan result from database
      // This would be done in the caller, but for now we'll just create a cache entry
      const ttl = this.TTL_MAP[level] || this.TTL_MAP.FAST;
      const expiresAt = new Date(Date.now() + ttl * 1000);

      await this.cacheModel.updateOne(
        { cacheKey },
        {
          cacheKey,
          packageName,
          versionCode,
          level,
          scanResult: { scanId }, // Placeholder - would be full result
          createdAt: new Date(),
          expiresAt,
          isStale: false,
        },
        { upsert: true },
      );

      this.logger.debug(`Cached scan for ${packageName}:${versionCode}:${level} (TTL: ${ttl}s)`);
    } catch (error) {
      this.logger.error(`Failed to cache result: ${error.message}`);
    }
  }

  /**
   * Invalidate cache on version change
   */
  async invalidateByVersion(packageName: string, newVersionCode: string): Promise<void> {
    try {
      await this.cacheModel.updateMany(
        { packageName, versionCode: { $ne: newVersionCode } },
        { isStale: true },
      );
      this.logger.debug(`Invalidated cache for ${packageName} (new version: ${newVersionCode})`);
    } catch (error) {
      this.logger.error(`Failed to invalidate cache: ${error.message}`);
    }
  }

  /**
   * Clear all cache
   */
  async clearAll(): Promise<void> {
    try {
      await this.cacheModel.deleteMany({});
      this.logger.log('Cache cleared');
    } catch (error) {
      this.logger.error(`Failed to clear cache: ${error.message}`);
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    total: number;
    fresh: number;
    stale: number;
  }> {
    try {
      const total = await this.cacheModel.countDocuments();
      const stale = await this.cacheModel.countDocuments({ isStale: true });
      const fresh = total - stale;

      return { total, fresh, stale };
    } catch (error) {
      this.logger.error(`Failed to get cache stats: ${error.message}`);
      return { total: 0, fresh: 0, stale: 0 };
    }
  }
}
