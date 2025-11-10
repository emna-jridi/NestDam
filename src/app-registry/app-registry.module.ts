
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppRegistryController } from './app-registry.controller';
import { AppRegistryService } from './app-registry.service';
import { App, AppSchema } from './schemas/app.schema';
import { Tracker, TrackerSchema } from './schemas/tracker.schema';
import { Permission, PermissionSchema } from './schemas/permission.schema';
import { ExternalApisModule } from '../external-apis/external-apis.module';
import { AnalysisModule } from '../analysis/analysis.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: App.name, schema: AppSchema },
      { name: Tracker.name, schema: TrackerSchema },
      { name: Permission.name, schema: PermissionSchema },
    ]),
    ExternalApisModule,
    AnalysisModule,
  ],
  controllers: [AppRegistryController],
  providers: [AppRegistryService],
  exports: [AppRegistryService],
})
export class AppRegistryModule {}