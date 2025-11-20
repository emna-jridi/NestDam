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
  BadRequestException,
  Delete,
  Headers as HeadersDecorator,
  HttpCode,
  NotFoundException,
  UseGuards,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ScanService } from './scan.service';
import { AnalyzeInstalledAppsDto } from './dto/installed-apps.dto';
import { SearchAppDto } from '../app-registry/dto/search-query.dto';
import { AppRegistryService } from '../app-registry/app-registry.service';
import * as fs from 'fs';
import { ExodusService } from 'src/external-apis/exodus.service';
import { ComparScansDto } from './dto/compare-scans.dto';
import { GetScansQueryDto } from './dto/get-scans.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AnalyzeIosAppsDto } from './dto/ios-screenshot.dto';

@Controller('api/v1/scan')
export class ScanController {
  constructor(
    private readonly scanService: ScanService,
    private readonly appRegistryService: AppRegistryService,
    private readonly exodusService: ExodusService,

  ) { }

  //  NOUVEAU : Analyser les apps installées depuis le mobile
  @Post('installed')
  @UseGuards(JwtAuthGuard)
  async scanInstalledApps(@Body() dto: AnalyzeInstalledAppsDto ){
    const userHash = dto.userHash; 
    try {
      return await this.scanService.analyzeInstalledApps(userHash, dto.apps);
    } catch (error) {
      throw new HttpException(
        'Failed to analyze installed apps',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ⭐ NOUVEAU : Rechercher la sécurité d'une app
  /* @Get('search')
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
             trackers: {
               total: app.trackers.length,
               list: app.trackers, // ou [] si tu n’as pas les détails
             }
           })),
         };
       }
     } catch (error) {
       throw new HttpException(
         'App not found or search failed',
         HttpStatus.NOT_FOUND,
       );
     }
   }*/

  // ⭐ NOUVEAU : Obtenir les détails complets d'une app
  // @Get('app/:packageName')
  // async getAppDetails(@Param('packageName') packageName: string) {
  //   try {
  //     return await this.scanService.searchAppSecurity(packageName);
  //   } catch (error) {
  //     throw new HttpException(
  //       `App ${packageName} not found`,
  //       HttpStatus.NOT_FOUND,
  //     );
  //   }
  // }

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
  // @Post('compare')
  // async compareApps(@Body() body: { packageNames: string[] }) {
  //   try {
  //     const results = await Promise.all(
  //       body.packageNames.map(pkg => this.scanService.searchAppSecurity(pkg))
  //     );

  //     return {
  //       apps: results,
  //       comparison: this.generateComparison(results),
  //     };
  //   } catch (error) {
  //     throw new HttpException(
  //       'Comparison failed',
  //       HttpStatus.INTERNAL_SERVER_ERROR,
  //     );
  //   }
  // }

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
  @Post('admin/add-package-mapping')
  async addPackageMapping(
    @Body() dto: { packageName: string; trackers: string[] },
  ) {
    this.exodusService.addPackageMapping(dto.packageName, dto.trackers);

    return {
      message: 'Package mapping added successfully',
      packageName: dto.packageName,
      trackers: dto.trackers,
    };
  }

  /**
   * ✅ NOUVEAU : Obtenir les stats du service Exodus
   */
  @Get('admin/exodus-stats')
  async getExodusStats() {
    return this.exodusService.getStats();
  }
  @Get('user/:userHash')
  async getUserScans(
    @Param('userHash') userHash: string,
    @Query() query: GetScansQueryDto,
    @HeadersDecorator('authorization') authHeader?: string,
  ) {
    try {
      // ✅ Vérifier le token (optionnel)
      if (authHeader) {
        const token = authHeader.replace('Bearer ', '');
        // Vous pouvez ajouter une vérification de token ici
      }

      const result = await this.scanService.getUserScans(userHash, query);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  // -------------------------------------------------------------
  // 🔍 GET SCAN BY ID
  // -------------------------------------------------------------
  @Get(':scanId')
  async getScanById(@Param('scanId') scanId: string) {
    try {
      const scan = await this.scanService.getScanById(scanId);

      return {
        success: true,
        data: scan,
      };
    } catch (error) {
      throw new NotFoundException(error.message);
    }
  }

  // -------------------------------------------------------------
  // 📌 GET LATEST SCAN
  // -------------------------------------------------------------
  @Get('latest/:userHash')
  async getLatestScan(@Param('userHash') userHash: string) {
    try {
      const scan = await this.scanService.getLatestScan(userHash);

      if (!scan) {
        return {
          success: true,
          data: null,
          message: 'No scans found for this user',
        };
      }

      return {
        success: true,
        data: scan,
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  // -------------------------------------------------------------
  // 🗑️ DELETE SCAN
  // -------------------------------------------------------------
  @Delete(':scanId')
  @HttpCode(HttpStatus.OK)
  async deleteScan(
    @Param('scanId') scanId: string,
    @Body('userHash') userHash: string,
  ) {
    try {
      if (!userHash) {
        throw new BadRequestException('userHash is required');
      }

      const result = await this.scanService.deleteScan(scanId, userHash);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  // -------------------------------------------------------------
  // 🔄 COMPARE TWO SCANS
  // -------------------------------------------------------------
  @Post('compare')
  async compareScans(
    @Body() compareDto: ComparScansDto,
    @HeadersDecorator('x-user-hash') userHash?: string,
  ) {
    try {
      if (!userHash) {
        throw new BadRequestException('User hash required in header');
      }

      const result = await this.scanService.compareScans(
        compareDto.scanId1,
        compareDto.scanId2,
        userHash,
      );

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  // -------------------------------------------------------------
  // 📊 GET USER STATISTICS
  // -------------------------------------------------------------
  @Get('stats/:userHash')
  async getUserStatistics(@Param('userHash') userHash: string) {
    try {
      const stats = await this.scanService.getScanStatistics(userHash);

      return {
        success: true,
        data: stats,
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }
  @Get('user/:userHash')
async getUserScanHistory(
  @Param('userHash') userHash: string,
  @Query() query: GetScansQueryDto
) {
   const result = await this.scanService.getUserScans(userHash, query);
   return {
      success: true,
      data: result
   };
}

  @Post('ios')
  @UseGuards(JwtAuthGuard)
  async scanIosApps(@Body() dto: AnalyzeIosAppsDto, @Req() req: any) {
    const userHash =
      dto.userHash || req.user?.userHash || req.user?.sub || 'anonymous';

    return this.scanService.analyzeIosApps(userHash, dto.apps);
  }

}
