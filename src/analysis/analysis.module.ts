
import { Module } from '@nestjs/common';
import { RiskCalculatorService } from './risk-calculator.service';
import { PermissionAnalyzerService } from './permission-analyzer.service';
import { TrackerDetectorService } from './tracker-detector.service';
import { MongooseModule } from '@nestjs/mongoose';
import { Tracker, TrackerSchema } from '../app-registry/schemas/tracker.schema';

@Module({
    imports: [
    MongooseModule.forFeature([
      { name: Tracker.name, schema: TrackerSchema },
    ]),
  ],
  providers: [
    RiskCalculatorService,
    PermissionAnalyzerService,
    TrackerDetectorService,
  ],
  exports: [
    RiskCalculatorService,
    PermissionAnalyzerService,
    TrackerDetectorService,
  ],
})
export class AnalysisModule {}