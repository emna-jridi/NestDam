
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScanController } from './scan.controller';
import { ScanService } from './scan.service';
import { Scan, ScanSchema } from './schemas/scan.schema';
import { ExternalApisModule } from '../external-apis/external-apis.module';
import { AppRegistryModule } from '../app-registry/app-registry.module';
import { AnalysisModule } from '../analysis/analysis.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Scan.name, schema: ScanSchema }]),
    ExternalApisModule,
    AppRegistryModule,
    AnalysisModule,
  ],
  controllers: [ScanController],
  providers: [ScanService],
  exports: [ScanService],
})
export class ScanModule {}