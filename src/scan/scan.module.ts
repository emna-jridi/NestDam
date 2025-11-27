import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScanController } from './scan.controller';
import { ScanService } from './scan.service';
import { Scan, ScanSchema } from './schemas/scan.schema';
import { ExternalApisModule } from '../external-apis/external-apis.module';
import { AppRegistryModule } from '../app-registry/app-registry.module';
import { Tracker, TrackerSchema } from 'src/app-registry/schemas/tracker.schema';
import { HeuristicDetectorService } from '../analysis/heuristic-detector.service';
import { ScanAnalyzerService } from './services/scan-analyzer.service';
import { ScanComparisonService } from './services/scan-comparison.service';
import { ScanStatisticsService } from './services/scan-statistics.service';
import { ScanSummaryService } from './services/scan-summary.service';
import { ScoreAggregatorService } from 'src/analysis/score-aggregator.service';
import { TrackerDetectionModule } from '../external-apis/tracker-detection/tracker-detection.module';
import { HttpModule } from '@nestjs/axios';
import { AnalysisModule } from 'src/analysis/analysis.module';
import { PermissionAnalyzerService } from 'src/analysis/permission-analyzer.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Scan.name, schema: ScanSchema },
      { name: Tracker.name, schema: TrackerSchema },
    ]),
    ExternalApisModule,
    AppRegistryModule,
    AnalysisModule,
    TrackerDetectionModule,
    HttpModule
  ],
  controllers: [ScanController],
  providers: [
    ScanService,
    ScanAnalyzerService,
    ScanComparisonService,
    ScanStatisticsService,
    ScanSummaryService,
    PermissionAnalyzerService,
    HeuristicDetectorService,
    ScoreAggregatorService
  ],
  exports: [ScanService],
})
export class ScanModule {}