import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScanController } from './scan.controller';
import { ScanService } from './scan.service';
import { Scan, ScanSchema } from './schemas/scan.schema';
import { ExternalApisModule } from '../external-apis/external-apis.module';
import { AppRegistryModule } from '../app-registry/app-registry.module';
import { AnalysisModule } from '../analysis/analysis.module';
import {
  Tracker,
  TrackerSchema,
} from 'src/app-registry/schemas/tracker.schema';
import { HeuristicDetectorService } from '../analysis/heuristic-detector.service';
import { PermissionAnalyzerService } from '../analysis/permission-analyzer.service';
import { ScanAnalyzerService } from './services/scan-analyzer.service';
import { ScanComparisonService } from './services/scan-comparison.service';
import { ScanStatisticsService } from './services/scan-statistics.service';
import { ScanSummaryService } from './services/scan-summary.service';
import { InsightsModule } from '../insights/insights.module';
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Scan.name, schema: ScanSchema },
      { name: Tracker.name, schema: TrackerSchema },
    ]),
    ExternalApisModule,
    AppRegistryModule,
    AnalysisModule,
    InsightsModule, // Import InsightsModule to access InsightsService
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
  ],
  exports: [ScanService],
})
export class ScanModule {}
