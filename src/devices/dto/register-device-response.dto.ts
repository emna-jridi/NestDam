import { ApiProperty } from '@nestjs/swagger';
import { DeviceResponseDto } from './device-response.dto';

export class RegisterDeviceResponseDto {
  @ApiProperty({ example: 'Device registered successfully' })
  message: string;

  @ApiProperty({ example: false })
  isRegistered: boolean;

  @ApiProperty({ type: DeviceResponseDto })
  device: DeviceResponseDto;
}
