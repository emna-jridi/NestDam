import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { nanoid } from 'nanoid';

// Note: pdfkit needs to be installed: npm install pdfkit @types/pdfkit
// For now, we'll create a placeholder that can be extended

@Injectable()
export class PdfGeneratorService {
  private readonly logger = new Logger(PdfGeneratorService.name);
  private readonly reportsDir = path.join(process.cwd(), 'storage', 'reports');

  constructor() {
    // Ensure reports directory exists
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }
  }

  async generatePDF(
    insights: any,
    dateRange: { startDate: Date; endDate: Date },
  ): Promise<string> {
    try {
      // Generate unique filename
      const filename = `report-${Date.now()}-${nanoid()}.pdf`;
      const filePath = path.join(this.reportsDir, filename);

      // For now, create a simple text-based PDF placeholder
      // In production, use pdfkit or puppeteer for proper PDF generation
      this.logger.warn(
        'PDF generation is using placeholder. Install pdfkit for full functionality.',
      );

      // Create a simple text file as placeholder
      const content = this.generatePDFContent(insights, dateRange);
      fs.writeFileSync(filePath.replace('.pdf', '.txt'), content);

      // Return the intended PDF path (will be implemented with pdfkit)
      return filePath;
    } catch (error) {
      this.logger.error('Failed to generate PDF', error);
      throw error;
    }
  }

  private generatePDFContent(insights: any, dateRange: any): string {
    return `
SECURITY REPORT
Generated: ${new Date().toISOString()}
Period: ${dateRange.startDate.toISOString()} to ${dateRange.endDate.toISOString()}

SUMMARY
Privacy Score: ${insights.summary?.privacyScore?.current || 'N/A'}
Total Scans: ${insights.summary?.scans?.total || 0}
Risky Apps: ${insights.summary?.apps?.riskyApps || 0}

TOP RISKS
${(insights.topRisks || [])
  .map(
    (risk: any, i: number) =>
      `${i + 1}. ${risk.appName} - ${risk.description}`,
  )
  .join('\n')}

RECOMMENDATIONS
${(insights.recommendations || [])
  .map(
    (rec: any, i: number) =>
      `${i + 1}. [${rec.priority.toUpperCase()}] ${rec.title}\n   ${rec.description}`,
  )
  .join('\n\n')}
`;
  }

  getFilePath(reportId: string): string {
    return path.join(this.reportsDir, `${reportId}.pdf`);
  }

  async deleteFile(filePath: string): Promise<void> {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      this.logger.error(`Failed to delete file: ${filePath}`, error);
    }
  }
}

