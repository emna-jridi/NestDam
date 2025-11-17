import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DevicesService } from './services/devices.service';
import { DevicesController } from './controllers/devices.controller';
import { Device, DeviceSchema } from './schemas/device.schema';
import { DeviceScan, DeviceScanSchema } from './schemas/device-scan.schema';
import { User, UserSchema } from '../user-management/entities/user.entity';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Device.name, schema: DeviceSchema },
      { name: DeviceScan.name, schema: DeviceScanSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  providers: [DevicesService],
  controllers: [DevicesController],
  exports: [DevicesService],
})
export class DevicesModule {}
