import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
const gplay = require('google-play-scraper');

export interface AppSearchResult {
    packageName: string;
    name: string;
    developer: string;
    category?: string;
    iconUrl: string;
    rating?: number;
    privacyScore?: number;
    riskLevel: string;
    trackers?: {
        total: number;
        list: string[];
    };
}

@Injectable()
export class AppSearchService {
    private readonly logger = new Logger(AppSearchService.name);

    /**
     * Search for apps in Google Play Store
     * @param query Search query
     * @param limit Maximum number of results (default 10)
     */
    async search(query: string, limit: number = 10): Promise<AppSearchResult[]> {
        try {
            this.logger.log(`Searching for apps with query: "${query}"`);

            const results = await gplay.search({
                term: query,
                num: limit,
            });

            return results.map(app => ({
                packageName: app.appId,
                name: app.title,
                developer: app.developer,
                iconUrl: app.icon,
                rating: typeof app.score === 'number' ? app.score : undefined,
                riskLevel: 'UNKNOWN', // Initial search doesn't have security analysis
            }));
        } catch (error) {
            // Surface the failure: an empty list would look like "no app found".
            this.logger.error(`App search failed for query "${query}": ${error.message}`);
            throw new ServiceUnavailableException('App search is unavailable, try again later');
        }
    }

    /**
     * Get app details by appId (packageName)
     * @param appId Package name of the app
     */
    async getAppDetails(appId: string): Promise<any> {
        try {
            this.logger.log(`Fetching details for app: ${appId}`);
            return await gplay.app({ appId });
        } catch (error) {
            this.logger.error(`Failed to fetch details for app ${appId}: ${error.message}`);
            return null;
        }
    }
}
