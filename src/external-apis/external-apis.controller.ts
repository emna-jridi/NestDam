import { Controller, Get, Logger } from '@nestjs/common';
import { EtipService } from './etip.service';

@Controller('v1/external/etip')
export class ExternalApisController {
  private readonly logger = new Logger(ExternalApisController.name);

  constructor(private readonly etipService: EtipService) {}
  @Get('trackers')
  async getAllTrackers() {
    try {
      const trackers = await this.etipService.getAllTrackers();

      return {
        success: true,
        count: trackers.length,
        data: trackers,
        cached: true, 
      };
    } catch (error) {
      this.logger.error(`Failed to fetch ETIP trackers: ${error.message}`);
      throw error;
    }
  }

  @Get('stats')
  async getStats() {
    try {
      const trackers = await this.etipService.getAllTrackers();

      const stats = {
        total: trackers.length,
        withCodeSignature: trackers.filter((t) => t.code_signature).length,
        withNetworkSignature: trackers.filter((t) => t.network_signature)
          .length,
        categories: this.groupByCapabilities(trackers),
      };

      return {
        success: true,
        data: stats,
      };
    } catch (error) {
      this.logger.error(`Failed to get ETIP stats: ${error.message}`);
      throw error;
    }
  }

 
  
  private groupByCapabilities(trackers: any[]) {
    const categories = {
      advertising: 0,
      analytics: 0,
      network: 0,
      other: 0,
    };

    for (const tracker of trackers) {
      if (tracker.advertising) categories.advertising++;
      if (tracker.analytic) categories.analytics++;
      if (tracker.network) categories.network++;
      if (!tracker.advertising && !tracker.analytic && !tracker.network) {
        categories.other++;
      }
    }

    return categories;
  }
}