// src/scan/scan.controller.ts
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
  Headers,
  NotFoundException,
  UseGuards,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ScanService } from './scan.service';
import { AppRegistryService } from '../app-registry/app-registry.service';
import { AnalyzeInstalledAppsDto } from './dto/installed-apps.dto';
import { AnalyzeIosAppsDto } from './dto/ios-screenshot.dto';   
import { ComparScansDto } from './dto/compare-scans.dto';
import { GetScansQueryDto } from './dto/get-scans.dto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import * as fs from 'fs';

@Controller('api/v1/scan')
export class ScanController {
  constructor(
    private readonly scanService: ScanService,
    private readonly appRegistryService: AppRegistryService,
  ) {}

  // -------------------------
  // ANDROID INSTALLED SCAN
  // -------------------------
  @Post('installed')
  @UseGuards(JwtAuthGuard)
  async scanInstalledApps(@Body() dto: AnalyzeInstalledAppsDto) {
    try {
      return await this.scanService.analyzeInstalledApps(dto.userHash, dto.apps);
    } catch (error) {
      throw new HttpException(
        'Failed to analyze installed apps',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // -------------------------
  // iOS SCAN (SCREENSHOT LIST)
  // -------------------------
  @Post('ios')
  @UseGuards(JwtAuthGuard)
  async scanIosApps(@Body() dto: AnalyzeIosAppsDto, @Req() req: any) {
    const userHash =
      dto.userHash || req.user?.userHash || req.user?.sub || 'anonymous';

    try {
      // DTO FIXED: now dto.apps is IosAppDto[]
      return await this.scanService.analyzeIosApps(userHash, dto.apps);
    } catch (error) {
      throw new HttpException(
        'Failed to analyze iOS apps',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // -------------------------
  // APK UPLOAD + MOBSF
  // -------------------------
  @Post('apk')
  @UseInterceptors(FileInterceptor('file'))
  async scanApk(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');

    const tempPath = `/tmp/${Date.now()}_${file.originalname}`;

    try {
      fs.writeFileSync(tempPath, file.buffer);
      const result = await this.scanService.uploadApk(tempPath);

      fs.unlinkSync(tempPath);
      return result;
    } catch (error) {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      throw new HttpException('APK scan failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // -------------------------
  // METADATA SCAN (internal use)
  // -------------------------
  @Post('metadata')
  async scanMetadata(@Body() metadata: any) {
    try {
      return await this.scanService.analyzeMetadata(metadata);
    } catch (error) {
      throw new HttpException('Metadata analysis failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // -------------------------
  // SEARCH
  // -------------------------
  @Get('search')
  async search(@Query('query') query: string, @Query('limit') limit?: number) {
    const q = query?.trim();
    if (!q) throw new BadRequestException('Query parameter is required');

    const searchLimit = limit || 20;

    if (q.includes('.')) {
      const app = await this.scanService.searchAppByPackage(q);
      return { query: q, count: 1, results: [app] };
    }

    const results = await this.scanService.searchAppsByName(q, searchLimit);
    return { query: q, count: results.length, results };
  }

  // -------------------------
  // GET APP DETAILS
  // -------------------------
  @Get('app/:packageName')
  async getAppDetails(@Param('packageName') packageName: string) {
    try {
      return await this.scanService.searchAppByPackage(packageName);
    } catch (error) {
      throw new NotFoundException(`App not found: ${packageName}`);
    }
  }

  // -------------------------
  // LATEST SCAN
  // -------------------------
  @Get('latest/:userHash')
  async getLatestScan(@Param('userHash') userHash: string) {
    try {
      const scan = await this.scanService.getLatestScan(userHash);
      if (!scan) return { success: true, data: null, message: 'No scans found' };
      return { success: true, data: scan };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  // -------------------------
  // STATS
  // -------------------------
  @Get('stats/:userHash')
  async getUserStatistics(@Param('userHash') userHash: string) {
    try {
      return { success: true, data: await this.scanService.getScanStatistics(userHash) };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  // -------------------------
  // ALL USER SCANS
  // -------------------------
  @Get('user/:userHash')
  async getUserScans(@Param('userHash') userHash: string, @Query() query: GetScansQueryDto) {
    try {
      return { success: true, data: await this.scanService.getUserScans(userHash, query) };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  // -------------------------
  // GET SCAN BY ID
  // -------------------------
  @Get(':scanId')
  async getScanById(@Param('scanId') scanId: string) {
    try {
      return { success: true, data: await this.scanService.getScanById(scanId) };
    } catch (error) {
      throw new NotFoundException(error.message);
    }
  }

  // -------------------------
  // COMPARE TWO SCANS
  // -------------------------
  @Post('compare')
  async compareScans(
    @Body() compareDto: ComparScansDto,
    @Headers('x-user-hash') userHash?: string,
  ) {
    if (!userHash) throw new BadRequestException('x-user-hash header is required');

    try {
      return {
        success: true,
        data: await this.scanService.compareScans(compareDto.scanId1, compareDto.scanId2, userHash),
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  // -------------------------
  // DELETE SCAN
  // -------------------------
  @Delete(':scanId')
  async deleteScan(@Param('scanId') scanId: string, @Body('userHash') userHash: string) {
    if (!userHash) throw new BadRequestException('userHash is required');

    try {
      return {
        success: true,
        data: await this.scanService.deleteScan(scanId, userHash),
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }
}
