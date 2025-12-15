import { Controller, Get, Param } from '@nestjs/common';
import { ReportService } from './report.service';

@Controller('report')
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Get(':packageName')
  async getReport(@Param('packageName') packageName: string) {
    return this.reportService.generateSafetyReport(packageName);
  }
}
