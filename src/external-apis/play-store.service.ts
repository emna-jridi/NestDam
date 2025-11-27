import { Injectable, Logger } from '@nestjs/common';
import gplay from 'google-play-scraper';

export interface PlayStoreDetailsResult {
  name: string;
  developer: string;
  developerReputation: number;
  category: string;
  iconUrl: string;
  description: string;
  rating: number;
  installs: string;
  installCount: number; 
  version: string;
  updated: Date;
  reviews: number; 
  contentRating: string; 
  updateFrequency: number; 
  reputationScore: number; 
}

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

 
  async getAppDetails(packageName: string): Promise<PlayStoreDetailsResult | null> {
    try {
      const details = await gplay.app({ appId: packageName });
      const developerReputation = this.calculateDeveloperReputation(details);
      const reputationScore = this.calculateReputationScore(details);
      const installCount = this.parseInstalls(details.installs || '0');
      const updateFrequency = this.estimateUpdateFrequency(details);

      return {
        name: details.title,
        developer: details.developer,
        developerReputation, 
        category: details.genre,
        iconUrl: details.icon,
        description: details.description,
        rating: details.score || 0,
        installs: details.installs || '0',
        installCount, 
        version: details.version || 'unknown',
        updated: new Date(details.updated || Date.now()),
        reviews: details.reviews || 0, 
        contentRating: details.contentRating || 'Everyone', 
        updateFrequency, 
        reputationScore, 
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


  private calculateDeveloperReputation(app: any): number {
    let score = 50;

    const rating = app.score || 0;
    score += (rating / 5.0) * 30;

    const installCount = this.parseInstalls(app.installs || '0');
    if (installCount > 100_000_000) score += 30;
    else if (installCount > 10_000_000) score += 25;
    else if (installCount > 1_000_000) score += 20;
    else if (installCount > 100_000) score += 15;
    else if (installCount > 10_000) score += 10;
    else score += 5;

    const reviews = app.reviews || 0;
    if (reviews > 1_000_000) score += 20;
    else if (reviews > 100_000) score += 15;
    else if (reviews > 10_000) score += 10;
    else if (reviews > 1_000) score += 5;

    const daysSinceUpdate = this.getDaysSinceUpdate(app.updated);
    if (daysSinceUpdate < 30) score += 10; 
    else if (daysSinceUpdate < 90) score += 5; 
    return Math.min(100, Math.round(score));
  }

  private calculateReputationScore(app: any): number {
    let score = 0;
    let weights = 0;

    if (app.score) {
      score += (app.score / 5.0) * 100 * 0.4;
      weights += 0.4;
    }

    const installCount = this.parseInstalls(app.installs || '0');
    let installScore = 0;
    if (installCount > 50_000_000) installScore = 100;
    else if (installCount > 10_000_000) installScore = 90;
    else if (installCount > 1_000_000) installScore = 80;
    else if (installCount > 100_000) installScore = 70;
    else if (installCount > 10_000) installScore = 60;
    else installScore = 50;
    score += installScore * 0.3;
    weights += 0.3;

    const reviews = app.reviews || 0;
    let reviewScore = 0;
    if (reviews > 500_000) reviewScore = 100;
    else if (reviews > 50_000) reviewScore = 90;
    else if (reviews > 5_000) reviewScore = 80;
    else if (reviews > 500) reviewScore = 70;
    else reviewScore = 60;
    score += reviewScore * 0.2;
    weights += 0.2;

    const daysSinceUpdate = this.getDaysSinceUpdate(app.updated);
    let updateScore = 100;
    if (daysSinceUpdate > 365) updateScore = 40;
    else if (daysSinceUpdate > 180) updateScore = 60;
    else if (daysSinceUpdate > 90) updateScore = 80;
    score += updateScore * 0.1;
    weights += 0.1;

    return Math.round(score / weights);
  }

  private estimateUpdateFrequency(app: any): number {
    const daysSinceUpdate = this.getDaysSinceUpdate(app.updated);
    if (daysSinceUpdate < 30) return 30;
    if (daysSinceUpdate < 90) return 60;
    if (daysSinceUpdate < 180) return 90;
    if (daysSinceUpdate < 365) return 180;

    return 365; 
  }

  private getDaysSinceUpdate(updated: number | string | undefined): number {
    if (!updated) return 365; 

    const updateDate =
      typeof updated === 'number' ? new Date(updated) : new Date(updated);
    const now = new Date();
    const diffMs = now.getTime() - updateDate.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }


  private parseInstalls(installs: string): number {
    const cleaned = installs.replace(/[+,]/g, '');
    return parseInt(cleaned, 10) || 0;
  }
}