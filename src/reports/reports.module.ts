import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportService } from '../report/report.service';
import { ReportController } from '../report/report.controller';
import {
  SecurityReport,
  SecurityReportSchema,
} from './schemas/security-report.schema';
import { InsightsModule } from '../insights/insights.module';
import { PdfGeneratorService } from './pdf/pdf-generator.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SecurityReport.name, schema: SecurityReportSchema },
    ]),
    InsightsModule,
    ConfigModule,
  ],
  controllers: [ReportsController, ReportController],
  providers: [ReportsService, ReportService, PdfGeneratorService],
  exports: [ReportsService],
})
export class ReportsModule {}

