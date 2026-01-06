import {
  Controller,
  Post,
  Get,
  UseInterceptors,
  UploadedFile,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UseGuards,
  Request,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiBody, ApiOperation, ApiResponse, ApiProperty } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { ScanService, AppSearchService } from './services';
import { FastMLScanService } from './services/fast-ml-scan.service';
import { StartScanDto, ScanLevel, AnalysisType, BatchScanDto } from './dto';

// Mock auth guard - replace with your actual auth
class AuthGuard {
  canActivate(context: any) {
    return true;
  }
}

@Controller('scan')
export class ScanController {
  constructor(
    private scanService: ScanService,
    private fastMLScanService: FastMLScanService,
    private appSearchService: AppSearchService,
  ) { }

  /**
   * Batch scan for multiple apps (e.g., from search or device list)
   */
  @Post('batch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Batch scan for multiple apps' })
  @ApiResponse({ status: 200, description: 'Batch scan results' })
  @UseGuards(AuthGuard)
  async batchScan(@Body() dto: BatchScanDto, @Request() req: any): Promise<any> {
    // Use userId from DTO or fallback to auth context
    const userId = dto.userHash || req.headers['x-user-id'] || req.user?.id;
    if (!userId) {
      throw new BadRequestException('userHash is required in body or as x-user-id header');
    }
    return this.scanService.startBatchScan(dto, userId);
  }

  /**
   * Search for apps on Google Play Store
   */
  @Get('apps/search')
  @ApiOperation({ summary: 'Search for apps on Play Store' })
  @ApiResponse({ status: 200, description: 'List of matching apps' })
  @UseGuards(AuthGuard)
  async searchApps(@Query('q') query: string, @Query('limit') limit: string): Promise<any> {
    if (!query) {
      throw new BadRequestException('Search query (q) is required');
    }
    const parsedLimit = parseInt(limit) || 10;
    const results = await this.appSearchService.search(query, parsedLimit);
    return {
      query,
      count: results.length,
      results,
    };
  }

  /**
   * Start a new scan - accepts packageName, file upload, or URL
   */
  @Post('start')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(
    FileInterceptor('apkFile', {
      storage: memoryStorage(),
      limits: { fileSize: 200 * 1024 * 1024 }, // 200MB
      fileFilter: (req, file, cb) => {
        const allowedMimes = ['application/vnd.android.package-archive', 'application/octet-stream'];
        if (allowedMimes.includes(file.mimetype) || file.originalname.endsWith('.apk') || file.originalname.endsWith('.aab')) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Only .apk and .aab files are allowed'), false);
        }
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Start APK scan',
    description: 'Start a security scan with SMART (fast, installed apps) or DEEP (comprehensive, with cloud analysis) mode. Accepts APK file upload, URL, or package name.'
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        apkFile: { type: 'string', format: 'binary', description: 'APK file to scan' },
        packageName: { type: 'string', description: 'Package name for installed app scan' },
        apkUrl: { type: 'string', description: 'URL to download APK from' },
        level: {
          type: 'string',
          enum: ['SMART', 'DEEP'],
          default: 'SMART',
          description: 'SMART: Fast scan for installed apps (ML + trackers + SAAT). DEEP: Comprehensive scan with cloud processing (N8N orchestration).'
        },
        analysisType: {
          type: 'string',
          enum: ['installed_app', 'apk_upload'],
          description: 'Auto-detected based on input. installed_app for packageName, apk_upload for file/URL.'
        }
      }
    }
  })
  @ApiResponse({
    status: 202,
    description: 'Scan queued successfully',
    schema: {
      example: {
        scanId: 'a1b2c3d4e5f6g7h8',
        status: 'QUEUED'
      }
    }
  })
  @UseGuards(AuthGuard)
  async startScan(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
    @Request() req: any,
  ): Promise<{ scanId: string; status: string }> {
    // Build DTO from multipart or JSON body
    const dto = new StartScanDto();

    if (file) {
      dto.apkFile = file;
    } else if (body.packageName) {
      dto.packageName = body.packageName;
    } else if (Array.isArray(body.apps) && body.apps.length > 0 && body.apps[0]?.packageName) {
      // Mobile client sends an apps array; map first entry to packageName for installed_app scans
      dto.packageName = body.apps[0].packageName;
    } else if (body.apkUrl) {
      dto.apkUrl = body.apkUrl;
    } else {
      throw new BadRequestException(
        'Provide one of: apkFile (multipart), packageName (or apps[0].packageName), or apkUrl',
      );
    }

    if (body.level && Object.values(ScanLevel).includes(body.level)) {
      dto.level = body.level;
    }

    // Derive analysis type when not provided explicitly
    if (body.analysisType && Object.values(AnalysisType).includes(body.analysisType)) {
      dto.analysisType = body.analysisType;
    } else {
      dto.analysisType = file || body.apkUrl ? AnalysisType.APK_UPLOAD : AnalysisType.INSTALLED_APP;
    }

    // Extract userId from request body (sent by Android app) or fall back to auth context
    const userId = body.userId || req.user?.id;
    if (!userId) {
      throw new BadRequestException('userId is required in request body or as authenticated user');
    }

    return this.scanService.startScan(dto, userId);
  }

  /**
   * Get scan result by ID
   */
  @Get(':scanId')
  @ApiOperation({ summary: 'Get scan result' })
  @ApiResponse({
    status: 200,
    description: 'Scan result with security scores, analysis details, and recommendations',
    schema: {
      example: {
        scanId: 'a1b2c3d4e5f6g7h8',
        packageName: 'com.example.app',
        level: 'SMART',
        analysisType: 'installed_app',
        status: 'COMPLETED',
        securityScore: 75,
        privacyScore: 68,
        globalRisk: 'MEDIUM',
        overallScore: 72.2,
        confidenceScore: 85.5,
        recommendDeepAnalysis: false,
        ml: { malwareProbability: 0.15, verdict: 'benign' },
        trackers: { count: 3, categories: {} },
        recommendations: []
      }
    }
  })
  @UseGuards(AuthGuard)
  async getScanResult(@Param('scanId') scanId: string): Promise<any> {
    return this.scanService.getScanResult(scanId);
  }

  /**
   * Get scan progress
   */
  @Get(':scanId/progress')
  @ApiOperation({ summary: 'Get scan progress' })
  @ApiResponse({ status: 200, description: 'Current scan progress' })
  @UseGuards(AuthGuard)
  async getScanProgress(@Param('scanId') scanId: string): Promise<any> {
    return this.scanService.getScanProgress(scanId);
  }

  /**
   * Get user's scan history
   */
  @Get('history/list')
  @ApiOperation({ summary: 'Get user scan history' })
  @ApiResponse({ status: 200, description: 'List of past scans' })
  @UseGuards(AuthGuard)
  async getHistory(
    @Request() req: any,
    @Query('userId') queryUserId: string,
    @Query('limit') limit: string,
    @Query('skip') skip: string,
  ): Promise<any> {
    // Extract userId from query, headers, or auth context
    const userId = queryUserId || req.headers['x-user-id'] || req.user?.id;
    if (!userId) {
      throw new BadRequestException('userId is required');
    }
    const parsedLimit = parseInt(limit) || 20;
    const parsedSkip = parseInt(skip) || 0;
    return this.scanService.getUserScans(userId, parsedLimit, parsedSkip);
  }

  /**
   * Get the latest scan for a user
   */
  @Get('latest/:userId')
  @ApiOperation({ summary: 'Get latest scan for a user' })
  @ApiResponse({ status: 200, description: 'Latest scan results' })
  @UseGuards(AuthGuard)
  async getLatest(@Param('userId') userId: string): Promise<any> {
    return this.scanService.getLatestScan(userId);
  }

  /**
   * Get scan statistics for a user
   */
  @Get('stats/:userId')
  @ApiOperation({ summary: 'Get scan statistics for a user' })
  @ApiResponse({ status: 200, description: 'Scan statistics' })
  @UseGuards(AuthGuard)
  async getStats(@Param('userId') userId: string): Promise<any> {
    return this.scanService.getScanStatistics(userId);
  }

  /**
   * Webhook callback for N8N deep scan results
   */
  @Post('callback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'N8N deep scan callback' })
  async handleCallback(@Body() callbackData: any): Promise<{ status: string }> {
    // This would integrate with N8N orchestration service
    // For now, just acknowledge
    return { status: 'received' };
  }

  /**
   * Get app details by package name (latest scan)
   */
  @Get('app/:packageName')
  @ApiOperation({ summary: 'Get app details by package name' })
  @ApiResponse({
    status: 200,
    description: 'Latest scan result for the specified package',
  })
  @UseGuards(AuthGuard)
  async getAppDetails(
    @Param('packageName') packageName: string,
    @Request() req: any,
  ): Promise<any> {
    // Extract userId from headers or auth context
    const userId = req.headers['x-user-id'] || req.user?.id;
    if (!userId) {
      throw new BadRequestException('userId is required (send via x-user-id header)');
    }
    return this.scanService.getLatestScanByPackage(packageName, userId);
  }

  /**
   * Health check
   */
  @Get('health/check')
  @ApiOperation({ summary: 'Scan service health check' })
  async healthCheck(): Promise<{ status: string }> {
    return { status: 'healthy' };
  }

  /**
   * Get ML model information
   */
  @Get('ml/model-info')
  @ApiOperation({ summary: 'Get ML model configuration and feature info' })
  async getModelInfo(): Promise<any> {
    return this.scanService.getMLModelInfo();
  }

  /**
   * FAST ML Scan - Quick manifest-based malware detection
   * Accepts APK file upload
   * Returns score, verdict (benign/malicious), threshold, and recommendation
   */
  @Post('fast')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('apkFile', {
      storage: memoryStorage(),
      limits: { fileSize: 200 * 1024 * 1024 }, // 200MB
      fileFilter: (req, file, cb) => {
        const allowedMimes = ['application/vnd.android.package-archive', 'application/octet-stream'];
        if (allowedMimes.includes(file.mimetype) || file.originalname.endsWith('.apk')) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Only .apk files are allowed'), false);
        }
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'FAST ML Scan',
    description: 'Quick manifest-based malware detection using Drebin LightGBM model',
  })
  @ApiResponse({
    status: 200,
    description: 'Scan result with score, verdict, and recommendation',
    schema: {
      example: {
        score: 0.29612722281895215,
        verdict: 'benign',
        threshold: 0.5526797385620915,
        recommendation: null,
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid APK file' })
  @ApiResponse({ status: 500, description: 'Scan failed' })
  async fastScan(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{
    score: number;
    verdict: 'benign' | 'malicious';
    threshold: number;
    recommendation: 'SMART' | 'DEEP' | null;
  }> {
    if (!file) {
      throw new BadRequestException('APK file required');
    }

    return this.fastMLScanService.scanApkBuffer(file.buffer, file.originalname);
  }
}
