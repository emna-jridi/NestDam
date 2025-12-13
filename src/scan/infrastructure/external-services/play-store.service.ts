import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface PlayStoreAppDetails {
  appName: string;
  rating: number;
  installCount: string;
  publisher: string;
  description: string;
}

@Injectable()
export class PlayStoreService {
  private logger = new Logger(PlayStoreService.name);
  private gplay: any;

  constructor(private configService: ConfigService) {
    // Import dynamique pour éviter les problèmes ESM/CJS
    try {
      const gplayModule = require('google-play-scraper');
      // Handle both ESM default export and CJS module.exports
      this.gplay = gplayModule.default || gplayModule;
      this.logger.log(`PlayStoreService initialized - app function available: ${typeof this.gplay.app === 'function'}`);
    } catch (error: any) {
      this.logger.warn(
        `Failed to load google-play-scraper: ${error.message}, will use fallback mode`,
      );
      this.gplay = null;
    }
  }

  async fetchAppDetails(packageName: string): Promise<PlayStoreAppDetails> {
    if (!this.gplay) {
      return this.getFallbackAppDetails(packageName);
    }

    let lastError: Error | null = null;
    const maxRetries = 2;
    const retryDelay = 1000; // ms

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.debug(`Fetching app details for ${packageName} (attempt ${attempt}/${maxRetries})`);

        const app = await this.gplay.app({
          appId: packageName,
          lang: 'en',
          country: 'us',
        });

        const result: PlayStoreAppDetails = {
          appName: app.title || packageName,
          rating: this.parseRating(app.scoreText),
          installCount: app.installs || 'Unknown',
          publisher: app.developer || 'Unknown',
          description: app.summary || '',
        };

        this.logger.debug(`Successfully fetched details for ${packageName}`);
        return result;
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(
          `Play Store fetch attempt ${attempt}/${maxRetries} failed for ${packageName}: ${lastError.message}`,
        );

        if (attempt < maxRetries) {
          await this.delay(retryDelay * attempt);
        }
      }
    }

    this.logger.warn(
      `Failed to fetch app details for ${packageName} after ${maxRetries} attempts, returning fallback`,
    );
    return this.getFallbackAppDetails(packageName);
  }

  async fetchAppPermissions(packageName: string): Promise<string[]> {
    if (!this.gplay) {
      return [];
    }

    try {
      this.logger.debug(`Fetching permissions for ${packageName}`);

      const app = await this.gplay.app({
        appId: packageName,
        lang: 'en',
        country: 'us',
      });

      // google-play-scraper retourne les permissions dans app.permissions
      if (app.permissions && Array.isArray(app.permissions)) {
        this.logger.debug(`Found ${app.permissions.length} permissions for ${packageName}`);
        return app.permissions.map(p => (typeof p === 'string' ? p : p.name || '')).filter(p => p.length > 0);
      }

      this.logger.debug(`No permissions found for ${packageName}, returning empty array`);
      return [];
    } catch (error: any) {
      this.logger.warn(
        `Permission fetch failed for ${packageName}: ${error.message}, returning empty array`,
      );
      return [];
    }
  }

  /**
   * Search for apps in Play Store
   */
  async searchApps(query: string, limit: number = 10): Promise<Array<{
    packageName: string;
    appName: string;
    icon: string;
    rating: number;
    downloads: string;
    developer: string;
  }>> {
    if (!this.gplay) {
      this.logger.warn('google-play-scraper not available, returning empty search results');
      return [];
    }

    try {
      this.logger.debug(`Searching Play Store for: ${query}`);

      const results = await this.gplay.search({
        term: query,
        num: limit,
        lang: 'en',
        country: 'us',
        fullDetail: false,
      });

      return results.map((app: any) => ({
        packageName: app.appId || '',
        appName: app.title || '',
        icon: app.icon || '',
        rating: this.parseRating(app.scoreText) || app.score || 0,
        downloads: app.installs || 'Unknown',
        developer: app.developer || 'Unknown',
      }));
    } catch (error: any) {
      this.logger.error(`Play Store search failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Parse rating string to number
   * google-play-scraper retourne scoreText comme "4.5" ou "4.5★"
   */
  private parseRating(scoreText: string | undefined): number {
    if (!scoreText) return 0;
    try {
      const score = parseFloat(scoreText.replace(/★|[^\d.]/g, ''));
      return isNaN(score) ? 0 : Math.min(5, Math.max(0, score));
    } catch (error) {
      this.logger.warn(`Failed to parse rating: ${scoreText}`);
      return 0;
    }
  }

  /**
   * Fallback data quand Play Store est indisponible
   */
  private getFallbackAppDetails(packageName: string): PlayStoreAppDetails {
    return {
      appName: packageName,
      rating: 0,
      installCount: 'Unknown',
      publisher: 'Unknown',
      description: 'Unable to fetch app information from Play Store.',
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
