import { Module } from '@nestjs/common';
import { RiskCalculatorService } from './risk-calculator.service';
import { PermissionAnalyzerService } from './permission-analyzer.service';
import { MongooseModule } from '@nestjs/mongoose';
import { Tracker, TrackerSchema } from '../app-registry/schemas/tracker.schema';
import { HeuristicDetectorService } from './heuristic-detector.service';
import { Scan, ScanSchema } from '../scan/schemas/scan.schema';
import { AnalysisController } from './analysis.controller';
import { AnalysisService } from './analysis.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Tracker.name, schema: TrackerSchema },
      { name: Scan.name, schema: ScanSchema },
    ]),
  ],
  controllers: [AnalysisController],
  providers: [
    RiskCalculatorService,
    PermissionAnalyzerService,
    HeuristicDetectorService,
    AnalysisService,
  ],
  exports: [
    RiskCalculatorService,
    PermissionAnalyzerService,
    HeuristicDetectorService,
    AnalysisService,
  ],
})
export class AnalysisModule {}
