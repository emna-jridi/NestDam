import { Controller, Post, Body, Logger } from '@nestjs/common';
import { ScanService } from '../scan/scan.service';

@Controller('api/v1/webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(private readonly scanService: ScanService) {}

  /**
   * ✅ Recevoir résultat analyse profonde depuis n8n
   */
  @Post('deep-analysis-result')
  async receiveDeepAnalysisResult(
    @Body() body: { scanId: string; result: any },
  ) {
    this.logger.log(`Webhook received for scan ${body.scanId}`);

    try {
      await this.scanService.receiveDeepAnalysisResult(
        body.scanId,
        body.result,
      );

      return {
        success: true,
        message: 'Deep analysis result received',
      };
    } catch (error) {
      this.logger.error(`Webhook processing failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}