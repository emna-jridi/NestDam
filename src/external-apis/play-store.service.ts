// src/modules/external-apis/play-store.service.ts

import { Injectable, Logger } from '@nestjs/common';
import gplay from 'google-play-scraper'; // npm install google-play-scraper

@Injectable()
export class PlayStoreService {
  private readonly logger = new Logger(PlayStoreService.name);

  async searchApp(query: string, limit: number = 10) {
    try {
      const results = await gplay.search({
        term: query,
        num: limit,
        lang: 'en',
        country: 'us',
      });
      return results;
    } catch (error) {
      this.logger.error('Failed to search Play Store', error);
      return [];
    }
  }

  async getAppDetails(packageName: string) {
    try {
      const details = await gplay.app({ appId: packageName });
      return {
        name: details.title,
        developer: details.developer,
        category: details.genre,
        iconUrl: details.icon,
        description: details.description,
        rating: details.score,
        installs: details.installs,
        version: details.version,
        updated: details.updated,
      };
    } catch (error) {
      this.logger.warn(`App not found in Play Store: ${packageName}`);
      return null;
    }
  }

  async getPermissions(packageName: string) {
    try {
      const permissions = await gplay.permissions({ appId: packageName });
      return permissions;
    } catch (error) {
      this.logger.error('Failed to fetch permissions', error);
      return [];
    }
  }
}