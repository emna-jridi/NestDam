import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';

// Schemas
import { AppSchema, AppSchemaFactory } from './infrastructure/schemas/app.schema';
import { ScanSchema, ScanSchemaFactory } from './infrastructure/schemas/scan.schema';

// Repositories
import { AppRepository } from './infrastructure/repositories/app.repository';
import { ScanRepository } from './infrastructure/repositories/scan.repository';
import { IAppRepository } from './domain/repositories/app.repository';
import { IScanRepository } from './domain/repositories/scan.repository';

// Domain Services
import { ScoreCalculatorService } from './domain/services/score-calculator.service';
import { ScanService } from './domain/services/scan.service';

// External Services
import { OllamaService } from './infrastructure/external-services/ollama.service';
import { PlayStoreService } from './infrastructure/external-services/play-store.service';
import { MobSFService } from './infrastructure/external-services/mobsf.service';
import { CacheService } from './infrastructure/cache/cache.service';

// Application Services (Use Cases)
import { StartScanUseCase } from './application/use-cases/start-scan.use-case';
import { GetScanStatusUseCase } from './application/use-cases/get-scan-status.use-case';

// Presentation
import { ScanController } from './presentation/controllers/scan.controller';
import { AppsController } from './presentation/controllers/apps.controller';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: 'App', schema: AppSchemaFactory },
      { name: 'Scan', schema: ScanSchemaFactory },
    ]),
  ],
  controllers: [ScanController, AppsController],
  providers: [
    // Repositories - Provide implementation with interface symbol
    {
      provide: IAppRepository,
      useClass: AppRepository,
    },
    {
      provide: IScanRepository,
      useClass: ScanRepository,
    },

    // Domain Services
    ScoreCalculatorService,
    ScanService,

    // External Services
    OllamaService,
    PlayStoreService,
    MobSFService,
    CacheService,

    // Application Services (Use Cases)
    StartScanUseCase,
    GetScanStatusUseCase,

    // Concrete Repositories (for controller injection)
    AppRepository,
    ScanRepository,
  ],
  exports: [
    StartScanUseCase,
    GetScanStatusUseCase,
    ScoreCalculatorService,
    ScanService,
    OllamaService,
    PlayStoreService,
    MobSFService,
    CacheService,
  ],
})
export class ScanModule {}
