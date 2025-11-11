import { Controller, Get, Query, Param } from '@nestjs/common';
import { AppRegistryService } from './app-registry.service';
import { SearchAppDto } from './dto/search-query.dto';

@Controller('api/v1/apps')
export class AppRegistryController {
  constructor(private readonly appRegistryService: AppRegistryService) {}

  // Rechercher des apps
  @Get('search')
  async searchApps(@Query() query: SearchAppDto) {
    return this.appRegistryService.searchApps(query.query, query.limit);
  }

  // Obtenir une app par package name
  @Get(':packageName')
  async getApp(@Param('packageName') packageName: string) {
    return this.appRegistryService.getOrCreateApp(packageName);
  }

  // Obtenir les apps les plus sûres
  @Get('top/safe')
  async getTopSafeApps(@Query('limit') limit: number = 10) {
    // À implémenter
    return { message: 'Top safe apps - to be implemented' };
  }

  // Obtenir les apps les plus dangereuses
  @Get('top/dangerous')
  async getTopDangerousApps(@Query('limit') limit: number = 10) {
    // À implémenter
    return { message: 'Top dangerous apps - to be implemented' };
  }
}
