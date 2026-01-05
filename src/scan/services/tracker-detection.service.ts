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
   * Known trackers patterns for common apps (heuristic fallback)
   */
  private readonly KNOWN_APP_TRACKERS: Record<string, { trackers: string[], risk: number, permissions?: string[] }> = {
    'com.truecaller': { trackers: ['Google Analytics', 'Facebook Analytics', 'AppsFlyer', 'Crashlytics'], risk: 0.35, permissions: ['INTERNET', 'READ_CONTACTS', 'READ_CALL_LOG', 'READ_PHONE_STATE', 'CAMERA'] },
    'com.facebook.katana': { trackers: ['Facebook Analytics', 'Facebook Ads', 'Facebook SDK'], risk: 0.45, permissions: ['INTERNET', 'CAMERA', 'READ_CONTACTS', 'ACCESS_FINE_LOCATION', 'RECORD_AUDIO'] },
    'com.facebook.orca': { trackers: ['Facebook Analytics', 'Facebook Ads'], risk: 0.4, permissions: ['INTERNET', 'CAMERA', 'READ_CONTACTS', 'RECORD_AUDIO', 'ACCESS_FINE_LOCATION'] },
    'com.whatsapp': { trackers: ['Google Analytics', 'Crashlytics'], risk: 0.15, permissions: ['INTERNET', 'READ_CONTACTS', 'CAMERA', 'RECORD_AUDIO', 'ACCESS_FINE_LOCATION'] },
    'com.instagram.android': { trackers: ['Facebook Analytics', 'Facebook Ads', 'AppsFlyer'], risk: 0.4, permissions: ['INTERNET', 'CAMERA', 'READ_CONTACTS', 'ACCESS_FINE_LOCATION', 'RECORD_AUDIO'] },
    'com.tiktok': { trackers: ['AppsFlyer', 'Adjust', 'Facebook Analytics', 'Google Analytics'], risk: 0.5, permissions: ['INTERNET', 'CAMERA', 'RECORD_AUDIO', 'READ_CONTACTS', 'ACCESS_FINE_LOCATION'] },
    'com.snapchat.android': { trackers: ['Adjust', 'Crashlytics', 'Branch'], risk: 0.35, permissions: ['INTERNET', 'CAMERA', 'RECORD_AUDIO', 'ACCESS_FINE_LOCATION', 'READ_CONTACTS'] },
    'com.twitter.android': { trackers: ['Google Analytics', 'MoPub', 'Crashlytics'], risk: 0.3, permissions: ['INTERNET', 'CAMERA', 'ACCESS_FINE_LOCATION', 'READ_CONTACTS'] },
    'com.spotify.music': { trackers: ['Google Analytics', 'Adjust', 'Crashlytics'], risk: 0.25, permissions: ['INTERNET', 'RECORD_AUDIO', 'BLUETOOTH'] },
    'com.pinterest': { trackers: ['Google Analytics', 'Facebook Analytics', 'Adjust', 'Branch', 'Crashlytics'], risk: 0.3, permissions: ['INTERNET', 'CAMERA', 'READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE', 'ACCESS_FINE_LOCATION'] },
    'com.linkedin.android': { trackers: ['Google Analytics', 'Adobe Analytics', 'Crashlytics'], risk: 0.25, permissions: ['INTERNET', 'READ_CONTACTS', 'CAMERA', 'ACCESS_FINE_LOCATION'] },
    'com.amazon.mShop.android.shopping': { trackers: ['Google Analytics', 'Amazon Ads', 'Crashlytics'], risk: 0.3, permissions: ['INTERNET', 'CAMERA', 'ACCESS_FINE_LOCATION', 'READ_CONTACTS'] },
    'com.netflix.mediaclient': { trackers: ['Google Analytics', 'Crashlytics'], risk: 0.15, permissions: ['INTERNET', 'ACCESS_NETWORK_STATE'] },
    'com.discord': { trackers: ['Google Analytics', 'Crashlytics', 'Sentry'], risk: 0.2, permissions: ['INTERNET', 'CAMERA', 'RECORD_AUDIO', 'READ_CONTACTS'] },
    'com.telegram.messenger': { trackers: ['Google Analytics'], risk: 0.1, permissions: ['INTERNET', 'READ_CONTACTS', 'CAMERA', 'RECORD_AUDIO', 'ACCESS_FINE_LOCATION'] },
    'org.telegram.messenger': { trackers: ['Google Analytics'], risk: 0.1, permissions: ['INTERNET', 'READ_CONTACTS', 'CAMERA', 'RECORD_AUDIO'] },
    'com.viber.voip': { trackers: ['Google Analytics', 'AppsFlyer', 'Crashlytics'], risk: 0.25, permissions: ['INTERNET', 'READ_CONTACTS', 'CAMERA', 'RECORD_AUDIO'] },
    'com.ubercab': { trackers: ['Google Analytics', 'Adjust', 'Crashlytics', 'Branch'], risk: 0.35, permissions: ['INTERNET', 'ACCESS_FINE_LOCATION', 'CAMERA', 'READ_CONTACTS'] },
    'com.zhiliaoapp.musically': { trackers: ['AppsFlyer', 'Adjust', 'Facebook Ads'], risk: 0.5 }, // TikTok variant
    'com.google': { trackers: ['Google Analytics', 'Firebase'], risk: 0.1 },
  };

  /**
   * Detect trackers from local database with improved heuristics
   */
  private detectTrackersLocal(packageName: string, apiUsed: string): TrackerResultDto {
    const foundTrackers: Tracker[] = [];
    const categories = { advertising: 0, analytics: 0, crossapp: 0, location: 0 };

    // 1. Check known apps first (heuristic for popular apps)
    const knownApp = this.findKnownAppMatch(packageName);
    if (knownApp) {
      this.logger.debug(`Found known app pattern for ${packageName}`);
      for (const trackerName of knownApp.trackers) {
        const category = this.inferTrackerCategory(trackerName);
        foundTrackers.push({
          id: `heuristic-${trackerName.toLowerCase().replace(/\s+/g, '-')}`,
          name: trackerName,
          category: category,
          found: true,
        });
        const categoryKey = category.toLowerCase().replace('-', '');
        if (categories[categoryKey] !== undefined) {
          categories[categoryKey]++;
        }
      }
    }

    // 2. Pattern-based detection from local DB
    for (const tracker of this.localTrackers) {
      // More flexible matching: partial package name, domain patterns
      const isMatched =
        (tracker.packageNames && tracker.packageNames.some((p: string) => 
          packageName.includes(p) || p.includes(packageName.split('.').slice(0, 2).join('.'))
        )) ||
        (tracker.domains && tracker.domains.some((d: string) => 
          packageName.toLowerCase().includes(d.split('.')[0])
        ));

      if (isMatched && !foundTrackers.some(t => t.name === tracker.name)) {
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

    // 3. Baseline trackers for apps with social/ad SDKs (heuristic)
    if (foundTrackers.length === 0 && this.likelyHasTrackers(packageName)) {
      foundTrackers.push({
        id: 'heuristic-baseline',
        name: 'Unknown Analytics SDK',
        category: 'Analytics',
        found: true,
      });
      categories.analytics++;
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
   * Find matching known app by package prefix
   */
  private findKnownAppMatch(packageName: string): { trackers: string[], risk: number } | null {
    // Exact match first
    if (this.KNOWN_APP_TRACKERS[packageName]) {
      return this.KNOWN_APP_TRACKERS[packageName];
    }
    // Prefix match (e.g., com.facebook.* matches com.facebook.katana)
    for (const [pattern, data] of Object.entries(this.KNOWN_APP_TRACKERS)) {
      if (packageName.startsWith(pattern) || pattern.startsWith(packageName.split('.').slice(0, 2).join('.'))) {
        return data;
      }
    }
    return null;
  }

  /**
   * Infer tracker category from name
   */
  private inferTrackerCategory(trackerName: string): 'Advertising' | 'Analytics' | 'Cross-app' | 'Location' {
    const name = trackerName.toLowerCase();
    if (name.includes('ads') || name.includes('ad ') || name.includes('mopub') || name.includes('admob')) return 'Advertising';
    if (name.includes('analytics') || name.includes('crashlytics') || name.includes('firebase')) return 'Analytics';
    if (name.includes('branch') || name.includes('appsflyer') || name.includes('adjust')) return 'Cross-app';
    if (name.includes('location') || name.includes('gps')) return 'Location';
    return 'Analytics';
  }

  /**
   * Heuristic: app likely has trackers if from major publishers
   */
  private likelyHasTrackers(packageName: string): boolean {
    const suspectPrefixes = ['com.facebook', 'com.google', 'com.tencent', 'com.bytedance', 'com.alibaba', 'com.baidu'];
    return suspectPrefixes.some(p => packageName.startsWith(p));
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
