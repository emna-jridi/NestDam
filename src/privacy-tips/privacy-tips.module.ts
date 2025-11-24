import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PrivacyTipsController } from './privacy-tips.controller';
import { PrivacyTipsService } from './privacy-tips.service';
import { AITipGeneratorService } from './services/ai-tip-generator.service';
import { PrivacyTip, PrivacyTipSchema } from './schemas/privacy-tip.schema';
import {
  PersonalizedTipCache,
  PersonalizedTipCacheSchema,
} from './schemas/personalized-tip-cache.schema';
import { UsersModule } from '../user-management/users.module';
import { Device, DeviceSchema } from '../devices/schemas/device.schema';
import {
  DeviceScan,
  DeviceScanSchema,
} from '../devices/schemas/device-scan.schema';
import { App, AppSchema } from '../app-registry/schemas/app.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PrivacyTip.name, schema: PrivacyTipSchema },
      { name: PersonalizedTipCache.name, schema: PersonalizedTipCacheSchema },
      { name: Device.name, schema: DeviceSchema },
      { name: DeviceScan.name, schema: DeviceScanSchema },
      { name: App.name, schema: AppSchema },
    ]),
    UsersModule,
  ],
  controllers: [PrivacyTipsController],
  providers: [PrivacyTipsService, AITipGeneratorService],
  exports: [PrivacyTipsService],
})
export class PrivacyTipsModule {}
