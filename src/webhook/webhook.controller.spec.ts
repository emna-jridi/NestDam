import { Body, Controller, Logger, Post } from '@nestjs/common';
import { ScanService } from '../scan/scan.service';

@Controller('api/v1/webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(private readonly scanService: ScanService) {}


  @Post('deep-analysis-result')
  async receiveDeepAnalysisResult(
    @Body() body: { scanId: string; result: any },
  ) {
    this.logger.log(
      `Webhook received deep analysis for scan ${body.scanId}`,
    );

    try {
      await this.scanService.receiveDeepAnalysisResult(
        body.scanId,
        body.result,
      );

      return {
        success: true,
        message: 'Deep analysis result saved successfully',
      };
    } catch (error: any) {
      this.logger.error(
        `Webhook processing failed: ${error.message}`,
        error.stack,
      );
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
