// src/external-apis/etip.service.ts

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
   * ✅ Fetch all trackers from ETIP API (JSON endpoint)
   */
  async getAllTrackers(forceRefresh = false): Promise<EtipTracker[]> {
    try {
      // 1) Redis Cache
      if (!forceRefresh) {
        const cached = await this.redisService.get<EtipTracker[]>(
          this.cacheKeyAllTrackers,
        );
        if (cached && cached.length > 0) {
          this.logger.log(
            `✅ Retrieved ${cached.length} trackers from Redis cache`,
          );
          return cached;
        }
      }

      // 2) Call ETIP JSON API
      const url = `${this.baseUrl}/api/trackers`;
      this.logger.log(
        `⏳ Fetching trackers from ETIP API: ${url} (timeout: 15s)`,
      );

      const response = await firstValueFrom(
        this.http.get<EtipTracker[]>(url, {
          timeout: 15000,
          validateStatus: (status) => status < 500, // Don't throw on 4xx
        }),
      );

      // Check HTTP status
      if (response.status !== 200) {
        throw new Error(
          `ETIP API returned status ${response.status}: ${response.statusText}`,
        );
      }

      const trackers = response.data;

      if (!Array.isArray(trackers)) {
        this.logger.error(`❌ Unexpected ETIP format: expected array`);
        this.logger.debug(JSON.stringify(response.data).substring(0, 300));
        return [];
      }

      if (trackers.length === 0) {
        this.logger.warn('⚠️ ETIP returned 0 trackers');
      } else {
        this.logger.log(
          `✅ Received ${trackers.length} trackers from ETIP API`,
        );
      }

      // 3) Cache in Redis
      await this.redisService.set(
        this.cacheKeyAllTrackers,
        trackers,
        this.cacheTtlSeconds,
      );

      return trackers;
    } catch (error) {
      // Enhanced error logging
      const errorDetails = this.extractErrorDetails(error);
      this.logger.error(
        `❌ Failed to fetch ETIP trackers from ${this.baseUrl}/api/trackers`,
      );
      this.logger.error(`   Error: ${errorDetails.message}`);
      this.logger.error(`   Code: ${errorDetails.code || 'N/A'}`);
      this.logger.error(
        `   Hint: ${errorDetails.hint || 'Check if ETIP service is running'}`,
      );

      // Try to return stale cache
      const stale = await this.redisService.get<EtipTracker[]>(
        this.cacheKeyAllTrackers,
      );
      if (stale && stale.length > 0) {
        this.logger.warn(
          `⚠️ Returning stale cached trackers (${stale.length} trackers)`,
        );
        return stale;
      }

      this.logger.warn(
        `⚠️ No cached trackers available. App analysis will continue without tracker detection.`,
      );
      return [];
    }
  }

  /**
   * Extract detailed error information for better diagnostics
   */
  private extractErrorDetails(error: unknown): {
    message: string;
    code?: string;
    hint?: string;
  } {
    const details: { message: string; code?: string; hint?: string } = {
      message: 'Unknown error',
    };

    // Type guard for Error objects
    if (error instanceof Error) {
      details.message = error.message;
    }

    // Check for network errors (AxiosError or Node.js errors)
    const errorObj = error as {
      code?: string;
      response?: { status?: number; statusText?: string };
      request?: unknown;
    };

    if (errorObj.code) {
      details.code = errorObj.code;
      switch (errorObj.code) {
        case 'ECONNREFUSED':
          details.hint = `Connection refused. Is ETIP service running at ${this.baseUrl}?`;
          break;
        case 'ENOTFOUND':
          details.hint = `Host not found. Check ETIP_BASE_URL environment variable.`;
          break;
        case 'ETIMEDOUT':
          details.hint = `Request timed out. ETIP service may be slow or unreachable.`;
          break;
        case 'ECONNRESET':
          details.hint = `Connection reset by peer. ETIP service may have crashed.`;
          break;
        default:
          details.hint = `Network error code: ${errorObj.code}`;
      }
    }

    // Check for Axios errors
    if (errorObj.response) {
      const status = errorObj.response.status ?? 'unknown';
      const statusText = errorObj.response.statusText ?? 'Unknown';
      details.code = `HTTP_${status}`;
      details.message = `HTTP ${status}: ${statusText}`;
      details.hint = `ETIP API returned an error response. Check ETIP service logs.`;
    } else if (errorObj.request) {
      details.hint = `No response received from ETIP service. Check network connectivity and ETIP_BASE_URL.`;
    }

    return details;
  }

  /**
   * 🔎 Search trackers by name or signature
   */
  async searchTrackers(query: string): Promise<EtipTracker[]> {
    const all = await this.getAllTrackers();
    const q = query.toLowerCase();

    return all.filter((t) => {
      const combined = `${t.name} ${t.description ?? ''}`.toLowerCase();
      return combined.includes(q);
    });
  }
}
