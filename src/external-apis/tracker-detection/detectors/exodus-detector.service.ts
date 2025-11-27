import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { RedisService } from '../../../redis/redis.service';
import { EtipService } from '../../etip.service';
import { DetectedTracker } from '../interfaces/tracker-detection.interface';

@Injectable()
export class ExodusDetectorService {
  private readonly logger = new Logger(ExodusDetectorService.name);
  private readonly baseUrl = 'https://reports.exodus-privacy.eu.org/api';
  private readonly cacheKeyPrefix = 'exodus:trackers:';
  private readonly cacheTtl = 60 * 60 * 24 * 7; // 7 jours

  constructor(
    private readonly http: HttpService,
    private readonly redis: RedisService,
    private readonly etipService: EtipService,
  ) {}

  async detectTrackers(packageName: string): Promise<DetectedTracker[]> {
    const cacheKey = `${this.cacheKeyPrefix}${packageName}`;
    const cached = await this.redis.get<DetectedTracker[]>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for ${packageName}`);
      return cached;
    }

    try {
      this.logger.debug(`Fetching Exodus data for ${packageName}`);

      const url = `${this.baseUrl}/search/${packageName}`;
      const response = await firstValueFrom(
        this.http.get<any>(url, { timeout: 5000 }),
      );

      const reports = Object.values(response.data || {});
      if (reports.length === 0) {
        this.logger.debug(`No Exodus report found for ${packageName}`);
        return [];
      }

      const latestReport: any = reports.sort(
        (a: any, b: any) => b.version_code - a.version_code,
      )[0];

      const trackerIds = latestReport.trackers || [];
      const allEtipTrackers = await this.etipService.getAllTrackers();
      const detectedTrackers: DetectedTracker[] = [];

      for (const trackerId of trackerIds) {
        const etipTracker = allEtipTrackers.find(
          (t) => t.id === trackerId.toString(),
        );

        if (etipTracker) {
          detectedTrackers.push({
            name: etipTracker.name,
            confidence: 90, 
            reason: 'Detected by Exodus Privacy',
          });
        }
      }

      await this.redis.set(cacheKey, detectedTrackers, this.cacheTtl);
      this.logger.log(
        `Found ${detectedTrackers.length} trackers for ${packageName} (Exodus)`,
      );

      return detectedTrackers;
    } catch (error) {
      if (error.response?.status === 404) {
        this.logger.debug(`App not found in Exodus: ${packageName}`);
      } else {
        this.logger.warn(`Exodus API failed: ${error.message}`);
      }
      return [];
    }
  }

  async isKnownApp(packageName: string): Promise<boolean> {
    try {
      const trackers = await this.detectTrackers(packageName);
      return trackers.length > 0;
    } catch {
      return false;
    }
  }
}