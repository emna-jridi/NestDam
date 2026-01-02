import {
  Controller,
  Post,
  Get,
  UseInterceptors,
  UploadedFile,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UseGuards,
  Request,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiBody, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { ScanService } from './services';
import { StartScanDto, ScanLevel } from './dto';

// Mock auth guard - replace with your actual auth
class AuthGuard {
  canActivate(context: any) {
    return true;
  }
}

@Controller('scan')
export class ScanController {
  constructor(private scanService: ScanService) {}

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
  @ApiOperation({ summary: 'Start APK scan' })
  @ApiResponse({ status: 202, description: 'Scan queued successfully' })
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
    } else if (body.apkUrl) {
      dto.apkUrl = body.apkUrl;
    } else {
      throw new BadRequestException(
        'Provide one of: apkFile (multipart), packageName, or apkUrl',
      );
    }

    if (body.level && Object.values(ScanLevel).includes(body.level)) {
      dto.level = body.level;
    }

    const userId = req.user?.id || 'anonymous';

    return this.scanService.startScan(dto, userId);
  }

  /**
   * Get scan result by ID
   */
  @Get(':scanId')
  @ApiOperation({ summary: 'Get scan result' })
  @ApiResponse({ status: 200, description: 'Scan result' })
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
    @Body() query: { limit?: number; skip?: number },
  ): Promise<any[]> {
    const userId = req.user?.id || 'anonymous';
    return this.scanService.getUserScans(userId, query.limit || 20, query.skip || 0);
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
}
