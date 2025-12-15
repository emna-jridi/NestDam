import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';

import { Alert, AlertSchema } from './alert.schema';
import { DeviceToken, DeviceTokenSchema } from './device-token.schema';
import { Device, DeviceSchema } from '../devices/schemas/device.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Alert.name, schema: AlertSchema }]),
    MongooseModule.forFeature([
      { name: DeviceToken.name, schema: DeviceTokenSchema },
    ]),
    MongooseModule.forFeature([{ name: Device.name, schema: DeviceSchema }]),
  ],
  controllers: [AlertsController],
  providers: [AlertsService],
  exports: [AlertsService],
})
export class AlertsModule {}
