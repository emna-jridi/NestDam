import { ApiProperty } from '@nestjs/swagger';

export class DeviceResponseDto {
  @ApiProperty({ example: '64b8f9f3a6c4b2a1d0e1f234' })
  _id: string;

  @ApiProperty({ example: '4b0f1c1d0da46637' })
  deviceIdentifier: string;

  @ApiProperty({ example: 'android' })
  platform: string;

  @ApiProperty({ example: '14.0', required: false })
  osVersion?: string;

  @ApiProperty({ example: 'Pixel 7', required: false })
  deviceModel?: string;

  @ApiProperty({ example: '1.2.3', required: false })
  appVersion?: string;
}
