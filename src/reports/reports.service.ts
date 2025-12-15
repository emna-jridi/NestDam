import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  StreamableFile,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SecurityReport, SecurityReportDocument } from './schemas/security-report.schema';
import { InsightsService } from '../insights/insights.service';
import { PdfGeneratorService } from './pdf/pdf-generator.service';
import { GenerateReportDto } from './dto/generate-report.dto';
import { nanoid } from 'nanoid';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);
  private readonly reportsDir = path.join(process.cwd(), 'storage', 'reports');

  constructor(
    @InjectModel(SecurityReport.name)
    private reportModel: Model<SecurityReportDocument>,
    private insightsService: InsightsService,
    private pdfGeneratorService: PdfGeneratorService,
  ) {
    // Ensure reports directory exists
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }
  }

  /**
   * Generate security report
   */
  async generateReport(
    userId: string,
    dto: GenerateReportDto,
  ): Promise<any> {
    try {
      // Calculate date range
      const dateRange = this.calculateDateRange(
        dto.timeRange,
        dto.startDate,
        dto.endDate,
      );

      // Get insights data
      const insights = await this.insightsService.getInsightsForPeriod(
        userId,
        dto.deviceId,
        dateRange.startDate,
        dateRange.endDate,
        dto.includeRecommendations !== false,
      );

      // Generate report based on format
      const reportId = `report_${Date.now()}_${nanoid(8)}`;
      let reportData: any;
      let filePath: string | null = null;
      let fileSize: number | null = null;

      switch (dto.format) {
        case 'json':
          reportData = this.generateJSONReport(insights, dateRange, dto);
          break;
        case 'pdf':
          filePath = await this.pdfGeneratorService.generatePDF(
            insights,
            dateRange,
          );
          fileSize = fs.existsSync(filePath)
            ? fs.statSync(filePath).size
            : null;
          reportData = {
            downloadUrl: `/api/reports/${reportId}/download`,
          };
          break;
        case 'html':
          filePath = await this.generateHTMLReport(insights, dateRange);
          fileSize = fs.existsSync(filePath)
            ? fs.statSync(filePath).size
            : null;
          reportData = {
            downloadUrl: `/api/reports/${reportId}/download`,
          };
          break;
      }

      // Save report metadata to database
      const report = await this.saveReport({
        reportId,
        userId,
        deviceId: dto.deviceId,
        timeRange: dto.timeRange,
        dateRange,
        format: dto.format,
        filePath,
        fileSize,
        metadata: {
          includeCharts: dto.includeCharts !== false,
          includeRecommendations: dto.includeRecommendations !== false,
          generatedAt: new Date(),
          summary: {
            privacyScore: insights.summary.privacyScore.current,
            totalScans: insights.summary.scans.total,
          },
        },
      });

      // Return response
      return {
        success: true,
        data: {
          reportId: report.reportId,
          generatedAt: report.createdAt.toISOString(),
          timeRange: {
            type: dto.timeRange,
            startDate: dateRange.startDate.toISOString(),
            endDate: dateRange.endDate.toISOString(),
          },
          summary: insights.summary,
          trends: insights.trends,
          topRisks: insights.topRisks,
          recommendations: insights.recommendations,
          ...reportData,
        },
      };
    } catch (error: any) {
      this.logger.error('Failed to generate report', error);
      throw new BadRequestException(
        `Failed to generate report: ${error.message}`,
      );
    }
  }

  /**
   * Get report history
   */
  async getReportHistory(
    userId: string,
    limit = 20,
    offset = 0,
    format?: string,
  ): Promise<any> {
    try {
      const query: any = { userId };
      if (format && format !== 'all') {
        query.format = format;
      }

      const [reports, total] = await Promise.all([
        this.reportModel
          .find(query)
          .sort({ createdAt: -1 })
          .limit(limit)
          .skip(offset)
          .lean()
          .exec(),
        this.reportModel.countDocuments(query),
      ]);

      return {
        success: true,
        data: {
          reports: reports.map((report) => ({
            reportId: report.reportId,
            generatedAt: report.createdAt.toISOString(),
            timeRange: report.timeRange,
            format: report.format,
            downloadUrl: report.filePath
              ? `/api/reports/${report.reportId}/download`
              : null,
            size: report.fileSize,
            summary: report.metadata?.summary || {},
          })),
          pagination: {
            total,
            limit,
            offset,
            hasMore: offset + limit < total,
          },
        },
      };
    } catch (error: any) {
      this.logger.error('Failed to get report history', error);
      throw new BadRequestException(
        `Failed to get report history: ${error.message}`,
      );
    }
  }

  /**
   * Download report file
   */
  async downloadReport(
    reportId: string,
    userId: string,
  ): Promise<StreamableFile> {
    const report = await this.reportModel.findOne({ reportId, userId });

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    if (report.expiresAt < new Date()) {
      throw new BadRequestException('Report has expired');
    }

    // For JSON format, return JSON response
    if (report.format === 'json') {
      throw new BadRequestException(
        'JSON reports are not downloadable. Use the generate endpoint to get JSON data.',
      );
    }

    // For PDF/HTML, return file
    if (!report.filePath || !fs.existsSync(report.filePath)) {
      throw new NotFoundException('Report file not found');
    }

    const fileStream = fs.createReadStream(report.filePath);
    const contentType =
      report.format === 'pdf'
        ? 'application/pdf'
        : 'text/html; charset=utf-8';

    return new StreamableFile(fileStream, {
      type: contentType,
      disposition: `attachment; filename="security-report-${report.reportId}.${report.format}"`,
    });
  }

  // ========== PRIVATE HELPER METHODS ==========

  /**
   * Calculate date range based on timeRange type
   */
  private calculateDateRange(
    timeRange: string,
    startDate?: string,
    endDate?: string,
  ): { startDate: Date; endDate: Date } {
    const now = new Date();

    switch (timeRange) {
      case 'week': {
        const dayOfWeek = now.getDay();
        const start = new Date(now);
        start.setDate(now.getDate() - dayOfWeek);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        return { startDate: start, endDate: end };
      }
      case 'month': {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        start.setHours(0, 0, 0, 0);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        end.setHours(23, 59, 59, 999);
        return { startDate: start, endDate: end };
      }
      case 'quarter': {
        const quarter = Math.floor(now.getMonth() / 3);
        const start = new Date(now.getFullYear(), quarter * 3, 1);
        start.setHours(0, 0, 0, 0);
        const end = new Date(now.getFullYear(), (quarter + 1) * 3, 0);
        end.setHours(23, 59, 59, 999);
        return { startDate: start, endDate: end };
      }
      case 'year': {
        const start = new Date(now.getFullYear(), 0, 1);
        start.setHours(0, 0, 0, 0);
        const end = new Date(now.getFullYear(), 11, 31);
        end.setHours(23, 59, 59, 999);
        return { startDate: start, endDate: end };
      }
      case 'custom': {
        if (!startDate || !endDate) {
          throw new BadRequestException(
            'startDate and endDate are required for custom time range',
          );
        }
        return {
          startDate: new Date(startDate),
          endDate: new Date(endDate),
        };
      }
      default:
        throw new BadRequestException(`Invalid time range: ${timeRange}`);
    }
  }

  /**
   * Generate JSON report
   */
  private generateJSONReport(
    insights: any,
    dateRange: { startDate: Date; endDate: Date },
    dto: GenerateReportDto,
  ): any {
    const report: any = {
      summary: insights.summary,
      trends: dto.includeCharts ? insights.trends : undefined,
      topRisks: insights.topRisks,
    };

    if (dto.includeRecommendations) {
      report.recommendations = insights.recommendations;
    }

    return report;
  }

  /**
   * Generate HTML report
   */
  private async generateHTMLReport(
    insights: any,
    dateRange: { startDate: Date; endDate: Date },
  ): Promise<string> {
    const filename = `report-${Date.now()}-${nanoid()}.html`;
    const filePath = path.join(this.reportsDir, filename);

    const html = this.generateHTMLContent(insights, dateRange);
    fs.writeFileSync(filePath, html);

    return filePath;
  }

  /**
   * Generate HTML content
   */
  private generateHTMLContent(
    insights: any,
    dateRange: { startDate: Date; endDate: Date },
  ): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <title>Security Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    h1 { color: #333; }
    .summary { background: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0; }
    .risk { margin: 10px 0; padding: 10px; border-left: 3px solid #ff6b6b; }
    .recommendation { margin: 10px 0; padding: 10px; background: #e8f5e9; border-radius: 3px; }
  </style>
</head>
<body>
  <h1>Security Report</h1>
  <p>Generated: ${new Date().toISOString()}</p>
  <p>Period: ${dateRange.startDate.toISOString()} to ${dateRange.endDate.toISOString()}</p>
  
  <div class="summary">
    <h2>Summary</h2>
    <p>Privacy Score: ${insights.summary?.privacyScore?.current || 'N/A'}</p>
    <p>Total Scans: ${insights.summary?.scans?.total || 0}</p>
    <p>Risky Apps: ${insights.summary?.apps?.riskyApps || 0}</p>
  </div>

  <h2>Top Risks</h2>
  ${(insights.topRisks || [])
    .map(
      (risk: any) => `
    <div class="risk">
      <strong>${risk.appName}</strong> - ${risk.description}
    </div>
  `,
    )
    .join('')}

  <h2>Recommendations</h2>
  ${(insights.recommendations || [])
    .map(
      (rec: any) => `
    <div class="recommendation">
      <strong>[${rec.priority.toUpperCase()}] ${rec.title}</strong><br>
      ${rec.description}
    </div>
  `,
    )
    .join('')}
</body>
</html>
`;
  }

  /**
   * Save report to database
   */
  private async saveReport(data: {
    reportId: string;
    userId: string;
    deviceId?: string;
    timeRange: string;
    dateRange: { startDate: Date; endDate: Date };
    format: string;
    filePath?: string | null;
    fileSize?: number | null;
    metadata: any;
  }): Promise<SecurityReportDocument> {
    const report = new this.reportModel({
      reportId: data.reportId,
      userId: data.userId,
      deviceId: data.deviceId,
      timeRange: data.timeRange,
      startDate: data.dateRange.startDate,
      endDate: data.dateRange.endDate,
      format: data.format,
      filePath: data.filePath,
      fileSize: data.fileSize,
      metadata: data.metadata,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    });

    return await report.save();
  }
}


