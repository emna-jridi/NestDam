import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ScanService } from './scan.service';
import { InstalledAppDto } from './dto/installed-apps.dto';

@Controller('api/v1/scan')
export class ScanController {
  private readonly logger = new Logger(ScanController.name);

  constructor(private readonly scanService: ScanService) {}

  @Post('quick/android')
  async quickScanAndroid(
    @Body() body: { userHash: string; apps: InstalledAppDto[] },
  ) {
    this.logger.log(`Quick Android scan: ${body.apps.length} apps`);

    try {
      return await this.scanService.scanAllApps(
        body.userHash,
        body.apps,
        'android',
      );
    } catch (error) {
      this.logger.error(`Quick Android scan failed: ${error.message}`);
      throw new HttpException(
        'Quick scan failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  
  @Post('quick/ios')
  async quickScanIos(
    @Body() body: { userHash: string; apps: InstalledAppDto[] },
  ) {
    this.logger.log(`Quick iOS scan: ${body.apps.length} apps`);

    try {
      return await this.scanService.scanAllApps(
        body.userHash,
        body.apps,
        'ios',
      );
    } catch (error) {
      this.logger.error(`Quick iOS scan failed: ${error.message}`);
      throw new HttpException(
        'Quick scan failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * ✅ MODE PROFOND : Analyse approfondie Android
   */
  @Post('deep/android')
  async deepScanAndroid(
    @Body() body: { userHash: string; app: InstalledAppDto },
  ) {
    this.logger.log(
      `Deep Android scan: ${body.app.packageName}`,
    );

    try {
      return await this.scanService.deepAnalyzeApp(
        body.userHash,
        body.app,
        'android',
      );
    } catch (error) {
      this.logger.error(`Deep Android scan failed: ${error.message}`);
      throw new HttpException(
        'Deep scan failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * ✅ MODE PROFOND : Analyse approfondie iOS
   */
  @Post('deep/ios')
  async deepScanIos(
    @Body() body: { userHash: string; app: InstalledAppDto },
  ) {
    this.logger.log(`Deep iOS scan: ${body.app.packageName}`);

    try {
      return await this.scanService.deepAnalyzeApp(
        body.userHash,
        body.app,
        'ios',
      );
    } catch (error) {
      this.logger.error(`Deep iOS scan failed: ${error.message}`);
      throw new HttpException(
        'Deep scan failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * ✅ Obtenir un scan par ID
   */
  @Get(':scanId')
  async getScan(@Param('scanId') scanId: string) {
    this.logger.log(`Getting scan: ${scanId}`);

    try {
      const scan = await this.scanService.getScanById(scanId);

      if (!scan) {
        throw new HttpException('Scan not found', HttpStatus.NOT_FOUND);
      }

      return {
        success: true,
        data: scan,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Get scan failed: ${error.message}`);
      throw new HttpException(
        'Failed to get scan',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * ✅ Obtenir le dernier scan d'un utilisateur
   */
  @Get('latest/:userHash')
  async getLatestScan(@Param('userHash') userHash: string) {
    this.logger.log(`Getting latest scan for user: ${userHash}`);

    try {
      const scan = await this.scanService.getLatestScan(userHash);

      if (!scan) {
        throw new HttpException('No scans found', HttpStatus.NOT_FOUND);
      }

      return {
        success: true,
        data: scan,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Get latest scan failed: ${error.message}`);
      throw new HttpException(
        'Failed to get latest scan',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * ✅ Obtenir tous les scans d'un utilisateur
   */
  @Get('user/:userHash')
  async getUserScans(
    @Param('userHash') userHash: string,
    @Query('limit') limit?: number,
    @Query('skip') skip?: number,
  ) {
    this.logger.log(`Getting scans for user: ${userHash}`);

    try {
      const scans = await this.scanService.getUserScans(userHash, {
        limit: limit ? parseInt(limit.toString()) : 10,
        skip: skip ? parseInt(skip.toString()) : 0,
      });

      return {
        success: true,
        data: scans,
      };
    } catch (error) {
      this.logger.error(`Get user scans failed: ${error.message}`);
      throw new HttpException(
        'Failed to get user scans',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * ✅ Supprimer un scan
   */
  @Delete(':scanId')
  async deleteScan(
    @Param('scanId') scanId: string,
    @Body('userHash') userHash: string,
  ) {
    this.logger.log(`Deleting scan: ${scanId}`);

    try {
      await this.scanService.deleteScan(scanId, userHash);

      return {
        success: true,
        message: 'Scan deleted successfully',
      };
    } catch (error) {
      this.logger.error(`Delete scan failed: ${error.message}`);
      throw new HttpException(
        'Failed to delete scan',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}