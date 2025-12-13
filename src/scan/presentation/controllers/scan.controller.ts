import { Controller, Post, Get, Body, Param, Query, HttpCode, HttpStatus, BadRequestException, Logger } from '@nestjs/common';
import { StartScanUseCase } from '../../application/use-cases/start-scan.use-case';
import { GetScanStatusUseCase } from '../../application/use-cases/get-scan-status.use-case';
import { ScanRepository } from '../../infrastructure/repositories/scan.repository';
import { AppRepository } from '../../infrastructure/repositories/app.repository';
import { StartScanRequestDto } from '../../domain/dtos/start-scan.dto';
import { ScanResponseDto, ScanStatusResponseDto } from '../../domain/dtos/scan-response.dto';
import { sanitizeString } from '../../utils/sanitize.util';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

@Controller('api/scan')
export class ScanController {
  private logger = new Logger(ScanController.name);

  constructor(
    private startScanUseCase: StartScanUseCase,
    private getScanStatusUseCase: GetScanStatusUseCase,
    private scanRepository: ScanRepository,
    private appRepository: AppRepository,
  ) {}

  @Post('start')
  @HttpCode(HttpStatus.OK)
  async startScan(@Body() request: StartScanRequestDto): Promise<ApiResponse<ScanResponseDto>> {
    try {
      // Validate request
      if (!request.apps || request.apps.length === 0) {
        throw new BadRequestException('At least one app package name is required');
      }

      this.logger.log(`Received scan request for ${request.apps.length} apps`);

      const result = await this.startScanUseCase.execute(request);

      return {
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      this.logger.error(`Scan start failed: ${error.message}`);
      return {
        success: false,
        error: sanitizeString(error.message),
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('status/:scanId')
  @HttpCode(HttpStatus.OK)
  async getScanStatus(@Param('scanId') scanId: string): Promise<ApiResponse<ScanStatusResponseDto>> {
    try {
      scanId = sanitizeString(scanId);

      const status = await this.getScanStatusUseCase.execute(scanId);

      return {
        success: true,
        data: status,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      this.logger.error(`Status check failed: ${error.message}`);
      return {
        success: false,
        error: sanitizeString(error.message),
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('app/:packageName')
  @HttpCode(HttpStatus.OK)
  async getAppAnalysis(@Param('packageName') packageName: string): Promise<ApiResponse<any>> {
    try {
      packageName = sanitizeString(packageName);

      const app = await this.appRepository.findByPackageName(packageName);
      if (!app) {
        return {
          success: false,
          error: 'App not found. Please run a scan first.',
          timestamp: new Date().toISOString(),
        };
      }

      return {
        success: true,
        data: {
          packageName: sanitizeString(app.packageName),
          appName: sanitizeString(app.appName || ''),
          platform: app.platform,
          finalScore: app.finalScore,
          lastScanned: app.lastScanned,
          permissionCount: Array.isArray(app.permissions)
            ? app.permissions.length
            : Object.keys(app.permissions || {}).length,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`App analysis fetch failed: ${error.message}`);
      return {
        success: false,
        error: sanitizeString(error.message),
        timestamp: new Date().toISOString(),
      };
    }
  }

  // DISABLED: Use /api/scan/latest/:userId instead
  // @Get('apps')
  // @HttpCode(HttpStatus.OK)
  // async getAllApps(): Promise<ApiResponse<any>> {
  //   return {
  //     success: false,
  //     error: 'Endpoint deprecated. Use GET /api/scan/latest/:userId',
  //     timestamp: new Date().toISOString(),
  //   };
  // }

  @Get('latest/:userId')
  @HttpCode(HttpStatus.OK)
  async getLatestScan(@Param('userId') userId: string): Promise<ApiResponse<any>> {
    try {
      userId = sanitizeString(userId);
      this.logger.log(`[SCAN] Fetching latest scan for userId: ${userId}`);

      // Find the most recent completed scan for this user
      const scans = await this.scanRepository.findAll();
      const userScans = scans
        .filter(scan => scan.userId === userId && scan.status === 'completed')
        .sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        });

      if (userScans.length === 0) {
        this.logger.log(`[SCAN] No completed scans found for userId: ${userId}`);
        // Return empty apps array, NOT a timestamp-only object
        return {
          success: true,
          data: {
            apps: [],
            globalScore: 0,
            createdAt: new Date().toISOString(),
          },
          timestamp: new Date().toISOString(),
        };
      }

      const latestScan = userScans[0];
      this.logger.log(`[SCAN_DB] Found scan ${latestScan.id} with ${latestScan.apps?.length || 0} apps`);

      // Map apps from the latest scan
      const apps = (latestScan.apps || []).map((app) => {
        const score = typeof app.finalScore === 'number' 
          ? app.finalScore 
          : app.finalScore?.score || 0;
        
        return {
          packageName: sanitizeString(app.packageName),
          appName: sanitizeString(app.appName || ''),
          finalScore: score,
          lastScanned: app.lastScanned,
        };
      });

      const globalScore = apps.length > 0
        ? apps.reduce((sum, app) => sum + app.finalScore, 0) / apps.length
        : 0;

      this.logger.log(`[SCAN] Returning ${apps.length} apps with global score ${globalScore}`);

      return {
        success: true,
        data: {
          apps: apps,
          globalScore: Math.round(globalScore),
          createdAt: latestScan.createdAt ? latestScan.createdAt.toISOString() : new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`[SCAN] Latest scan fetch failed: ${error.message}`);
      return {
        success: false,
        error: sanitizeString(error.message),
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('history')
  @HttpCode(HttpStatus.OK)
  async getScanHistory(
    @Query('userId') userId: string,
    @Query('limit') limit: string = '10',
    @Query('offset') offset: string = '0',
  ): Promise<ApiResponse<any>> {
    try {
      if (!userId) {
        return {
          success: false,
          error: 'userId is required',
          timestamp: new Date().toISOString(),
        };
      }

      const scans = await this.scanRepository.findAll();
      const userScans = scans
        .filter(scan => scan.userId === sanitizeString(userId))
        .sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        });

      const limitNum = parseInt(limit, 10) || 10;
      const offsetNum = parseInt(offset, 10) || 0;
      const paginatedScans = userScans.slice(offsetNum, offsetNum + limitNum);

      const formattedScans = paginatedScans.map(scan => ({
        scanId: scan.id,
        status: scan.status,
        totalApps: scan.totalApps || 0,
        scannedApps: scan.scannedApps || 0,
        createdAt: scan.createdAt ? scan.createdAt.toISOString() : new Date().toISOString(),
        completedAt: scan.completedAt ? scan.completedAt.toISOString() : undefined,
      }));

      return {
        success: true,
        data: {
          scans: formattedScans,
          total: userScans.length,
          limit: limitNum,
          offset: offsetNum,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`[SCAN] History fetch failed: ${error.message}`);
      return {
        success: false,
        error: sanitizeString(error.message),
        timestamp: new Date().toISOString(),
      };
    }
  }
}
