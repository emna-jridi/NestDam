import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { EtipTracker } from './interfaces/etip-tracker.interface';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class EtipService {
  private readonly logger = new Logger(EtipService.name);
  private readonly baseUrl: string;
  private readonly cacheKeyAllTrackers = 'etip:trackers:all';
  private readonly cacheTtlSeconds = 60 * 60 * 24; // 24h

  constructor(
    private readonly http: HttpService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    this.baseUrl =
      this.configService.get<string>('ETIP_BASE_URL') ??
      'http://localhost:8000';
  }
  async getAllTrackers(forceRefresh = false): Promise<EtipTracker[]> {
    try {
      if (!forceRefresh) {
        const cached = await this.redisService.get<EtipTracker[]>(this.cacheKeyAllTrackers);
        if (cached && cached.length > 0) {
          this.logger.log(` Retrieved ${cached.length} trackers from Redis cache`);
          return cached;
        }
      }
      this.logger.log('⏳ Fetching trackers from ETIP API (/api/trackers)...');

      const url = `${this.baseUrl}/api/trackers`;

      const response = await firstValueFrom(
        this.http.get<EtipTracker[]>(url, {
          timeout: 15000,
        }),
      );

      let trackers = response.data;

      if (!Array.isArray(trackers)) {
        this.logger.error(` Unexpected ETIP format: expected array`);
        this.logger.debug(JSON.stringify(response.data).substring(0, 300));
        return [];
      }

      if (trackers.length === 0) {
        this.logger.warn(' ETIP returned 0 trackers');
      } else {
        this.logger.log(` Received ${trackers.length} trackers from ETIP API`);
      }

      await this.redisService.set(
        this.cacheKeyAllTrackers,
        trackers,
        this.cacheTtlSeconds,
      );

      return trackers;
    } catch (error) {
      this.logger.error(
        ` Failed to fetch ETIP trackers: ${error.message}`,
        error.stack,
      );

      const stale = await this.redisService.get<EtipTracker[]>(this.cacheKeyAllTrackers);
      if (stale) {
        this.logger.warn(` Returning stale cached trackers (${stale.length})`);
        return stale;
      }

      return [];
    }
  }


  async searchTrackers(query: string): Promise<EtipTracker[]> {
    const all = await this.getAllTrackers();
    const q = query.toLowerCase();

    return all.filter((t) => {
      const combined = `${t.name} ${t.description ?? ''}`
        .toLowerCase();
      return combined.includes(q);
    });
  }
}
