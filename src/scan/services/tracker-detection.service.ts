import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { TrackerResultDto, Tracker } from '../dto';
import { CACHING_SERVICE } from '../services';

@Injectable()
export class TrackerDetectionService {
  private readonly logger = new Logger(TrackerDetectionService.name);
  private readonly TRACKERS_DB_PATH = process.env.TRACKERS_DB_PATH || './data/trackers_v1.json';
  private readonly EXODUS_API_URL = 'https://reports.exodus-privacy.eu.org/api/search';
  private readonly API_TIMEOUT = 10000; // 10 seconds
  private readonly MAX_RETRIES = 3;
  private readonly CACHE_TTL = 30 * 24 * 60 * 60; // 30 days
  private localTrackers: any[] = [];
  private requestCount = 0;
  private lastRequestTime = 0;
  private readonly RATE_LIMIT_INTERVAL = 36000; // 100 requests per hour

  constructor() {
    this.loadLocalTrackerDatabase();
  }

  /**
   * Load local trackers database
   */
  private loadLocalTrackerDatabase(): void {
    try {
      if (fs.existsSync(this.TRACKERS_DB_PATH)) {
        const data = fs.readFileSync(this.TRACKERS_DB_PATH, 'utf-8');
        this.localTrackers = JSON.parse(data);
        this.logger.log(`Loaded ${this.localTrackers.length} local trackers`);
      } else {
        this.logger.warn(`Trackers database not found at ${this.TRACKERS_DB_PATH}`);
        this.localTrackers = [];
      }
    } catch (error) {
      this.logger.error(`Failed to load trackers database: ${error.message}`);
      this.localTrackers = [];
    }
  }

  /**
   * Detect trackers in APK
   */
  async detectTrackers(packageName: string): Promise<TrackerResultDto> {
    const startTime = Date.now();

    try {
      // Try Exodus API first with caching
      const cachedResult = await this.getCachedTrackers(packageName);
      if (cachedResult) {
        this.logger.debug(`Trackers found in cache for ${packageName}`);
        return { ...cachedResult, apiUsed: 'exodus', cachingStatus: 'cached' };
      }

      // Check rate limiting
      if (!this.canMakeRequest()) {
        this.logger.warn(`Rate limit approaching, using local database for ${packageName}`);
        return this.detectTrackersLocal(packageName, 'fallback');
      }

      // Call Exodus API with retry logic
      const exodusResult = await this.callExodusApiWithRetry(packageName);
      if (exodusResult) {
        // Cache the result
        await this.cacheTrackers(packageName, exodusResult);
        this.logger.debug(`Trackers detected via Exodus API for ${packageName}`);
        return { ...exodusResult, apiUsed: 'exodus', cachingStatus: 'fresh' };
      }

      // Fallback to local database
      this.logger.warn(`Exodus API failed for ${packageName}, using local database`);
      return this.detectTrackersLocal(packageName, 'fallback');
    } catch (error) {
      this.logger.error(`Tracker detection failed for ${packageName}: ${error.message}`);
      return this.detectTrackersLocal(packageName, 'fallback');
    }
  }

  /**
   * Call Exodus Privacy API with retry logic
   */
  private async callExodusApiWithRetry(packageName: string, attempt: number = 1): Promise<TrackerResultDto | null> {
    try {
      const url = `${this.EXODUS_API_URL}/${packageName}`;
      this.logger.debug(`Calling Exodus API: ${url} (attempt ${attempt})`);

      const response = await axios.get(url, {
        timeout: this.API_TIMEOUT,
        headers: {
          'User-Agent': 'ShadowGuard/2.0',
        },
      });

      this.requestCount++;
      this.lastRequestTime = Date.now();

      if (response.data && response.data.trackers) {
        return this.parseExodusResponse(response.data.trackers);
      }

      return null;
    } catch (error) {
      if (attempt < this.MAX_RETRIES) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        this.logger.warn(`Exodus API attempt ${attempt} failed, retrying in ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.callExodusApiWithRetry(packageName, attempt + 1);
      }

      this.logger.error(`Exodus API failed after ${this.MAX_RETRIES} attempts`);
      return null;
    }
  }

  /**
   * Detect trackers from local database
   */
  private detectTrackersLocal(packageName: string, apiUsed: string): TrackerResultDto {
    const foundTrackers: Tracker[] = [];
    const categories = { advertising: 0, analytics: 0, crossapp: 0, location: 0 };

    for (const tracker of this.localTrackers) {
      const isMatched =
        (tracker.packageNames && tracker.packageNames.includes(packageName)) ||
        (tracker.domains && tracker.domains.some((d) => packageName.includes(d)));

      if (isMatched) {
        foundTrackers.push({
          id: tracker.id,
          name: tracker.name,
          category: tracker.category,
          found: true,
        });

        const categoryKey = tracker.category.toLowerCase().replace('-', '');
        if (categories[categoryKey] !== undefined) {
          categories[categoryKey]++;
        }
      }
    }

    const privacyScore = this.calculatePrivacyScore(categories, foundTrackers.length);

    return {
      totalFound: foundTrackers.length,
      categories,
      trackers: foundTrackers,
      privacyScore,
      apiUsed: apiUsed as any,
      cachingStatus: 'fresh',
    };
  }

  /**
   * Parse Exodus API response
   */
  private parseExodusResponse(trackersData: any): TrackerResultDto {
    const foundTrackers: Tracker[] = [];
    const categories = { advertising: 0, analytics: 0, crossapp: 0, location: 0 };

    for (const tracker of trackersData) {
      const category = this.normalizeCategoryName(tracker.category);
      foundTrackers.push({
        id: tracker.id.toString(),
        name: tracker.name,
        category: category as any,
        found: true,
      });

      if (categories[category]) {
        categories[category]++;
      }
    }

    const privacyScore = this.calculatePrivacyScore(categories, foundTrackers.length);

    return {
      totalFound: foundTrackers.length,
      categories,
      trackers: foundTrackers,
      privacyScore,
      apiUsed: 'exodus',
      cachingStatus: 'fresh',
    };
  }

  /**
   * Calculate privacy score based on trackers
   */
  private calculatePrivacyScore(
    categories: { advertising: number; analytics: number; crossapp: number; location: number },
    totalTrackers: number,
  ): number {
    let penalty = 0;

    // Weights per tracker type
    penalty += categories.advertising * 10;
    penalty += categories.analytics * 5;
    penalty += categories.crossapp * 8;
    penalty += categories.location * 15;

    // Additional penalty for excessive trackers
    if (totalTrackers > 5) penalty += 10;
    if (totalTrackers > 10) penalty += 20;

    return Math.max(0, 100 - penalty);
  }

  /**
   * Normalize tracker category name
   */
  private normalizeCategoryName(category: string): 'Advertising' | 'Analytics' | 'Cross-app' | 'Location' {
    const normalized = category.toLowerCase();
    if (normalized.includes('advert')) return 'Advertising';
    if (normalized.includes('analyt')) return 'Analytics';
    if (normalized.includes('cross')) return 'Cross-app';
    if (normalized.includes('locat')) return 'Location';
    return 'Analytics'; // Default
  }

  /**
   * Check if can make API request (rate limiting)
   */
  private canMakeRequest(): boolean {
    const timeSinceLastRequest = Date.now() - this.lastRequestTime;

    if (timeSinceLastRequest > this.RATE_LIMIT_INTERVAL) {
      this.requestCount = 0;
      return true;
    }

    return this.requestCount < 100;
  }

  /**
   * Get cached trackers result
   */
  private async getCachedTrackers(packageName: string): Promise<TrackerResultDto | null> {
    // This would integrate with your caching service
    // For now, return null to skip caching in this example
    return null;
  }

  /**
   * Cache trackers result
   */
  private async cacheTrackers(packageName: string, result: TrackerResultDto): Promise<void> {
    // This would integrate with your caching service
    // TTL: 30 days
  }

  /**
   * Reload local trackers database
   */
  reloadLocalDatabase(): void {
    this.logger.log('Reloading local trackers database...');
    this.loadLocalTrackerDatabase();
  }
}
