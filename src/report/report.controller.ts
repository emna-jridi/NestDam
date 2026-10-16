import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { ReportService } from './report.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('report')
@ApiBearerAuth()
@Controller('report')
@UseGuards(JwtAuthGuard)
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Get(':packageName')
  @ApiOperation({ summary: 'Generate AI safety report for an application' })
  @ApiResponse({ status: 200, description: 'AI safety report generated successfully' })
  async getReport(@Param('packageName') packageName: string) {
    return this.reportService.generateSafetyReport(packageName);
  }
}