import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';

import { Alert, AlertSchema } from './alert.schema';
import { DeviceToken, DeviceTokenSchema } from './device-token.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Alert.name, schema: AlertSchema }]),
    MongooseModule.forFeature([{ name: DeviceToken.name, schema: DeviceTokenSchema }]),
  ],
  controllers: [AlertsController],
  providers: [AlertsService],
})
export class AlertsModule {}
