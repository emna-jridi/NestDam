
import { Controller, Post, Body, Logger } from '@nestjs/common';
import { TrackerDetectionOrchestrator } from './tracker-detection.orchestrator';
import type { TrackerDetectionContext } from './interfaces/tracker-detection.interface'; // ✅ AJOUT "type"

@Controller('api/v1/tracker-detection')
export class TrackerDetectionController {
  private readonly logger = new Logger(TrackerDetectionController.name);

  constructor(
    private readonly orchestrator: TrackerDetectionOrchestrator,
  ) {}

  /**
   * ✅ Endpoint appelé par n8n pour analyse IA profonde
   */
  @Post('analyze-deep')
  async analyzeDeep(@Body() context: TrackerDetectionContext) {
    this.logger.log(`Received deep analysis request for ${context.packageName}`);

    try {
      const result = await this.orchestrator.analyzeDeep(context);
      return result;
    } catch (error) {
      this.logger.error(`Deep analysis failed: ${error.message}`);
      throw error;
    }
  }
}