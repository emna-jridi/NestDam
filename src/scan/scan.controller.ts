// src/modules/scan/scan.controller.ts (VERSION COMPLÈTE)

import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseInterceptors,
  UploadedFile,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ScanService } from './scan.service';
import { AnalyzeInstalledAppsDto } from './dto/installed-apps.dto';
import { SearchAppDto } from '../app-registry/dto/search-query.dto';
import { AppRegistryService } from '../app-registry/app-registry.service';
import * as fs from 'fs';

@Controller('api/v1/scan')
export class ScanController {
  constructor(
    private readonly scanService: ScanService,
    private readonly appRegistryService: AppRegistryService,
  ) {}

  // ⭐ NOUVEAU : Analyser les apps installées depuis le mobile
  @Post('installed')
  async scanInstalledApps(@Body() dto: AnalyzeInstalledAppsDto) {
    try {
      return await this.scanService.analyzeInstalledApps(dto);
    } catch (error) {
      throw new HttpException(
        'Failed to analyze installed apps',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ⭐ NOUVEAU : Rechercher la sécurité d'une app
  @Get('search')
  async searchAppSecurity(@Query() query: SearchAppDto) {
    try {
      if (query.query.includes('.')) {
        // C'est un package name
        return await this.scanService.searchAppSecurity(query.query);
      } else {
        // C'est un nom d'app - rechercher d'abord
        const apps = await this.appRegistryService.searchApps(query.query, query.limit);
        return {
          results: apps.map(app => ({
            packageName: app.packageName,
            name: app.name,
            developer: app.developer,
            category: app.category,
            iconUrl: app.iconUrl,
            privacyScore: app.privacyScore,
            trackers: app.trackers.length,
          })),
        };
      }
    } catch (error) {
      throw new HttpException(
        'App not found or search failed',
        HttpStatus.NOT_FOUND,
      );
    }
  }

  // ⭐ NOUVEAU : Obtenir les détails complets d'une app
  @Get('app/:packageName')
  async getAppDetails(@Param('packageName') packageName: string) {
    try {
      return await this.scanService.searchAppSecurity(packageName);
    } catch (error) {
      throw new HttpException(
        `App ${packageName} not found`,
        HttpStatus.NOT_FOUND,
      );
    }
  }

  // Endpoint existant : Upload APK
  @Post('apk')
  @UseInterceptors(FileInterceptor('file'))
  async scanApk(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
    }

    const tempPath = `/tmp/${Date.now()}_${file.originalname}`;
    
    try {
      fs.writeFileSync(tempPath, file.buffer);
      const result = await this.scanService.uploadApk(tempPath);
      
      // Nettoyer le fichier temporaire
      fs.unlinkSync(tempPath);
      
      return result;
    } catch (error) {
      // Nettoyer en cas d'erreur
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
      throw new HttpException(
        'APK scan failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Endpoint existant : Analyser métadonnées
  @Post('metadata')
  async scanMetadata(@Body() metadata: any) {
    try {
      return await this.scanService.analyzeMetadata(metadata);
    } catch (error) {
      throw new HttpException(
        'Metadata analysis failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ⭐ NOUVEAU : Obtenir l'historique des scans
  @Get('history')
  async getScanHistory(
    @Query('userHash') userHash?: string,
    @Query('limit') limit: number = 20,
  ) {
    // À implémenter dans ScanService
    return { message: 'History endpoint - to be implemented' };
  }

  // ⭐ NOUVEAU : Comparer plusieurs apps
  @Post('compare')
  async compareApps(@Body() body: { packageNames: string[] }) {
    try {
      const results = await Promise.all(
        body.packageNames.map(pkg => this.scanService.searchAppSecurity(pkg))
      );

      return {
        apps: results,
        comparison: this.generateComparison(results),
      };
    } catch (error) {
      throw new HttpException(
        'Comparison failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private generateComparison(apps: any[]) {
    const sorted = [...apps].sort((a, b) => b.privacyScore - a.privacyScore);
    
    return {
      bestChoice: sorted[0],
      worstChoice: sorted[sorted.length - 1],
      avgScore: apps.reduce((sum, app) => sum + app.privacyScore, 0) / apps.length,
      comparison: apps.map(app => ({
        packageName: app.packageName,
        name: app.name,
        score: app.privacyScore,
        trackers: app.trackers.total,
        dangerousPermissions: app.permissions.dangerous.length,
      })),
    };
  }
}