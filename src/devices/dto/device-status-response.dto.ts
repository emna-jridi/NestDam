import { ApiProperty } from '@nestjs/swagger';
import { DeviceResponseDto } from './device-response.dto';

export class DeviceStatusResponseDto {
  @ApiProperty({ example: true })
  isDeviceRegistered: boolean;

  @ApiProperty({ example: 1 })
  deviceCount: number;

  @ApiProperty({ type: [DeviceResponseDto] })
  devices: DeviceResponseDto[];
}
