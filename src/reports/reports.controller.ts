import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  Res,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ReportsService } from './reports.service';
import { ReportService } from '../report/report.service';
import { GenerateReportDto } from './dto/generate-report.dto';
import {
  ReportHistoryQueryDto,
  ReportHistoryResponseDto,
} from './dto/report-history.dto';

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly reportService: ReportService, // Keep existing service for backward compatibility
  ) {}

  @Post('generate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate a comprehensive security report' })
  @ApiBody({ type: GenerateReportDto })
  @ApiResponse({
    status: 200,
    description: 'Report generated successfully',
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async generateReport(@Req() req: any, @Body() dto: GenerateReportDto) {
    try {
      const userId = req.user.userId;
      return await this.reportsService.generateReport(userId, dto);
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }

  @Get('history')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get report history' })
  @ApiResponse({
    status: 200,
    description: 'Report history retrieved successfully',
    type: ReportHistoryResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getReportHistory(
    @Req() req: any,
    @Query() query: ReportHistoryQueryDto,
  ) {
    try {
      const userId = req.user.userId;
      return await this.reportsService.getReportHistory(
        userId,
        query.limit || 20,
        query.offset || 0,
        query.format,
      );
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }

  @Get(':reportId/download')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Download a generated report file' })
  @ApiResponse({
    status: 200,
    description: 'Report file downloaded successfully',
  })
  @ApiResponse({ status: 404, description: 'Report not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async downloadReport(
    @Req() req: any,
    @Param('reportId') reportId: string,
    @Res() res: Response,
  ) {
    try {
      const userId = req.user.userId;
      const file = await this.reportsService.downloadReport(reportId, userId);
      return file;
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }

  // Keep existing endpoint for backward compatibility
  @Get('app/:packageName')
  @ApiOperation({ summary: 'Get app safety report (legacy)' })
  async getAppReport(@Param('packageName') packageName: string) {
    return this.reportService.generateSafetyReport(packageName);
  }
}

