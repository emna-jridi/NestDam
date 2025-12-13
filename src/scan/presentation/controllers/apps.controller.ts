import { Controller, Post, Get, Body, Param, Query, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { ScanService } from '../../domain/services/scan.service';
import { SearchAppRequestDto } from '../../domain/dtos/search-app.dto';
import { sanitizeString } from '../../utils/sanitize.util';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

@Controller('api/apps')
export class AppsController {
  private logger = new Logger(AppsController.name);

  constructor(private scanService: ScanService) {}

  /**
   * Search for apps in Play Store/App Store
   * POST /api/apps/search
   */
  @Post('search')
  @HttpCode(HttpStatus.OK)
  async searchApp(@Body() request: SearchAppRequestDto): Promise<ApiResponse<any>> {
    try {
      if (!request.query || request.query.trim().length < 2) {
        return {
          success: false,
          error: 'Search query must be at least 2 characters',
          timestamp: new Date().toISOString(),
        };
      }

      this.logger.log(`[SEARCH] Searching for: ${request.query}`);

      const results = await this.scanService.searchApp({
        query: sanitizeString(request.query),
        platform: request.platform || 'android',
        limit: request.limit || 10,
      });

      return {
        success: true,
        data: results,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      this.logger.error(`[SEARCH] Search failed: ${error.message}`);
      return {
        success: false,
        error: sanitizeString(error.message),
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get detailed app information
   * GET /api/apps/:packageName
   */
  @Get(':packageName')
  @HttpCode(HttpStatus.OK)
  async getAppDetails(@Param('packageName') packageName: string): Promise<ApiResponse<any>> {
    try {
      packageName = sanitizeString(packageName);

      if (!packageName || packageName.length < 3) {
        return {
          success: false,
          error: 'Invalid package name',
          timestamp: new Date().toISOString(),
        };
      }

      this.logger.log(`[APP_DETAILS] Fetching details for: ${packageName}`);

      const details = await this.scanService.getAppDetails(packageName);

      return {
        success: true,
        data: details,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      this.logger.error(`[APP_DETAILS] Failed to get details for ${packageName}: ${error.message}`);
      return {
        success: false,
        error: sanitizeString(error.message),
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get app details from Play Store only (without scan)
   * GET /api/apps/store/:packageName
   */
  @Get('store/:packageName')
  @HttpCode(HttpStatus.OK)
  async getStoreInfo(@Param('packageName') packageName: string): Promise<ApiResponse<any>> {
    try {
      packageName = sanitizeString(packageName);

      this.logger.log(`[STORE_INFO] Fetching store info for: ${packageName}`);

      // This endpoint could be expanded to just fetch store data without full analysis
      const details = await this.scanService.getAppDetails(packageName);

      return {
        success: true,
        data: {
          packageName,
          appName: details.app.appName,
          storeData: details.app.storeData,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      this.logger.error(`[STORE_INFO] Failed: ${error.message}`);
      return {
        success: false,
        error: sanitizeString(error.message),
        timestamp: new Date().toISOString(),
      };
    }
  }
}
