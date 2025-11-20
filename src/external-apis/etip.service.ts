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

  /**
   * Get all trackers from ETIP (with Redis caching)
   */
  async getAllTrackers(forceRefresh = false): Promise<EtipTracker[]> {
    if (!forceRefresh) {
      const cached = await this.redisService.get<EtipTracker[]>(
        this.cacheKeyAllTrackers,
      );
      if (cached && cached.length > 0) {
        this.logger.debug(
          `[ETIP] Returning ${cached.length} trackers from Redis cache`,
        );
        return cached;
      }
    }

    this.logger.log('[ETIP] Fetching trackers from ETIP API...');
    // ⚠️ Simple version: first page only. You can extend with pagination later.
    const url = `${this.baseUrl}/api/trackers/`;

    const response = await firstValueFrom(
      this.http.get<any>(url, {
        // If ETIP is paginated with results + next, adapt here
        // params: { page_size: 1000 },
      }),
    );

    // If ETIP returns { results: [...] }
    const trackers: EtipTracker[] = Array.isArray(response.data)
      ? response.data
      : response.data.results ?? [];

    this.logger.log(`[ETIP] Loaded ${trackers.length} trackers from API`);

    await this.redisService.set(this.cacheKeyAllTrackers, trackers, this.cacheTtlSeconds);

    return trackers;
  }

  /**
   * Optional: search trackers by name / signature
   */
  async searchTrackers(query: string): Promise<EtipTracker[]> {
    const all = await this.getAllTrackers();
    const q = query.toLowerCase();

    return all.filter((t) => {
      const combined =
        `${t.name} ${t.description ?? ''} ${t.code_signature ?? ''} ${
          t.network_signature ?? ''
        }`.toLowerCase();
      return combined.includes(q);
    });
  }
}
