import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Scan,
  ScanSchema,
  ScanCache,
  ScanCacheSchema,
  ScanProgress,
  ScanProgressSchema,
} from './entities';
import {
  ScanService,
  APKFileHandlerService,
  FeatureExtractionService,
  MLMalwareDetectorService,
  TrackerDetectionService,
  SAATAnalysisService,
  ScoringService,
  RecommendationsService,
  CacheService,
  ProgressTrackingService,
  N8NOrchestrationService,
} from './services';
import { ScanController } from './scan.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Scan.name, schema: ScanSchema },
      { name: ScanCache.name, schema: ScanCacheSchema },
      { name: ScanProgress.name, schema: ScanProgressSchema },
    ]),
  ],
  controllers: [ScanController],
  providers: [
    ScanService,
    APKFileHandlerService,
    FeatureExtractionService,
    MLMalwareDetectorService,
    TrackerDetectionService,
    SAATAnalysisService,
    ScoringService,
    RecommendationsService,
    CacheService,
    ProgressTrackingService,
    N8NOrchestrationService,
  ],
  exports: [ScanService],
})
export class ScanModule {}
