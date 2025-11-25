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
  HttpCode,
  NotFoundException,
  UseGuards,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ScanService } from './scan.service';
import { AnalyzeInstalledAppsDto, InstalledAppDto } from './dto/installed-apps.dto';
import { AppRegistryService } from '../app-registry/app-registry.service';
import { ComparScansDto } from './dto/compare-scans.dto';
import { GetScansQueryDto } from './dto/get-scans.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AnalyzeIosAppsDto } from './dto/ios-screenshot.dto';
import * as fs from 'fs';

@Controller('api/v1/scan')
export class ScanController {
  constructor(
    private readonly scanService: ScanService,
    private readonly appRegistryService: AppRegistryService,
  ) {}

  @Post('installed')
  @UseGuards(JwtAuthGuard)
  async scanInstalledApps(@Body() dto: AnalyzeInstalledAppsDto) {
    try {
      return await this.scanService.analyzeInstalledApps(
        dto.userHash,
        dto.apps,
      );
    } catch (error) {
      throw new HttpException(
        'Failed to analyze installed apps',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

 
  @Post('ios')
  @UseGuards(JwtAuthGuard)
  async scanIosApps(@Body() dto: AnalyzeInstalledAppsDto , @Req() req: any) {
    const userHash =
      dto.userHash || req.user?.userHash || req.user?.sub || 'anonymous';

    try {
      return await this.scanService.analyzeIosApps(userHash, dto.apps);
    } catch (error) {
      throw new HttpException(
        'Failed to analyze iOS apps',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('apk')
  @UseInterceptors(FileInterceptor('file'))
  async scanApk(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const tempPath = `/tmp/${Date.now()}_${file.originalname}`;

    try {
      fs.writeFileSync(tempPath, file.buffer);
      const result = await this.scanService.uploadApk(tempPath);

      fs.unlinkSync(tempPath);
      return result;
    } catch (error) {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
      throw new HttpException(
        'APK scan failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

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

  @Get('search')
  async search(@Query('query') query: string, @Query('limit') limit?: number) {
    const q = query?.trim();
    if (!q) {
      throw new BadRequestException('Query parameter is required');
    }
    const searchLimit = limit || 20;
    if (q.includes('.')) {
      const app = await this.scanService.searchAppByPackage(q);
      return {
        query: q,
        count: 1,
        results: [app],
      };
    }
    const results = await this.scanService.searchAppsByName(q, searchLimit);

    return {
      query: q,
      count: results.length,
      results,
    };
  }

  @Get('app/:packageName')
  async getAppDetails(@Param('packageName') packageName: string) {
    try {
      return await this.scanService.searchAppByPackage(packageName);
    } catch (error) {
      throw new NotFoundException(`App not found: ${packageName}`);
    }
  }

  
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
  async getUserScans(
    @Param('userHash') userHash: string,
    @Query() query: GetScansQueryDto,
  ) {
    try {
      const result = await this.scanService.getUserScans(userHash, query);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

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

  @Post('compare')
  async compareScans(
    @Body() compareDto: ComparScansDto,
    @Headers('x-user-hash') userHash?: string,
  ) {
    try {
      if (!userHash) {
        throw new BadRequestException('User hash required in x-user-hash header');
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
  @Delete(':scanId')
  @HttpCode(HttpStatus.OK)
  async deleteScan(
    @Param('scanId') scanId: string,
    @Body('userHash') userHash: string,
  ) {
    try {
      if (!userHash) {
        throw new BadRequestException('userHash is required in body');
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
}