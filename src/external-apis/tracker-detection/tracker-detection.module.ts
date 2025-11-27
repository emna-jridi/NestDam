// src/external-apis/tracker-detection/tracker-detection.module.ts

import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';

import { TrackerDetectionOrchestrator } from './tracker-detection.orchestrator';
import { TrackerDetectionController } from './TrackerDetection.Controller';

// Detectors
import { ExodusDetectorService } from './detectors/exodus-detector.service';
import { HeuristicDetectorService } from './detectors/heuristic-detector.service';

// AI
import { OpenRouterAiService } from './ai/openrouter-ai.service';
import { AiAnalyzerService } from './ai/ai-analyzer.service';

// Services externes
import { ExternalApisModule } from '../external-apis.module';
import { RedisModule } from '../../redis/redis.module';

@Module({
  imports: [
    HttpModule,
    ExternalApisModule, // Pour avoir accès à PlayStoreService, EtipService, etc.
    RedisModule,        // Pour avoir accès à RedisService
  ],
  controllers: [TrackerDetectionController],
  providers: [
    // Orchestrateur principal
    TrackerDetectionOrchestrator,

    // Detectors
    ExodusDetectorService,
    HeuristicDetectorService,

    // AI
    OpenRouterAiService,
    AiAnalyzerService,
  ],
  exports: [
    TrackerDetectionOrchestrator, // ✅ TRÈS IMPORTANT : Exporter l'orchestrateur
  ],
})
export class TrackerDetectionModule {}