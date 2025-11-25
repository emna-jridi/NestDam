import { Controller, Get, Query, Param } from '@nestjs/common';
import { AppRegistryService } from './app-registry.service';

@Controller('api/v1/apps')
export class AppRegistryController {
  constructor(private readonly appRegistryService: AppRegistryService) {}

  @Get('search')
  async searchApps(
    @Query('query') query: string,
    @Query('limit') limit?: number,
  ) {
    return this.appRegistryService.searchApps(query, limit || 10);
  }


  
  @Get(':packageName')
  async getApp(@Param('packageName') packageName: string) {
    return this.appRegistryService.getOrCreateApp(packageName);
  }


  
  @Get('top/safe')
  async getTopSafeApps(@Query('limit') limit?: number) {
    return this.appRegistryService.getTopSafeApps(limit || 10);
  }


  
  @Get('top/dangerous')
  async getTopDangerousApps(@Query('limit') limit?: number) {
    return this.appRegistryService.getTopDangerousApps(limit || 10);
  }

  
  @Get('stats')
  async getStats() {
    return this.appRegistryService.getStats();
  }
}