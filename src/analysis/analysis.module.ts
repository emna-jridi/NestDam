import { Module } from '@nestjs/common';
import { RiskCalculatorService } from './risk-calculator.service';
import { PermissionAnalyzerService } from './permission-analyzer.service';
import { MongooseModule } from '@nestjs/mongoose';
import { Tracker, TrackerSchema } from '../app-registry/schemas/tracker.schema';
import { HeuristicDetectorService } from './heuristic-detector.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Tracker.name, schema: TrackerSchema },
    ]),
  ],
  providers: [
    RiskCalculatorService,
    PermissionAnalyzerService,
    HeuristicDetectorService,
  ],
  exports: [
    RiskCalculatorService,
    PermissionAnalyzerService,
    HeuristicDetectorService,
  ],
})
export class AnalysisModule {}