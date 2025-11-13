import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDeviceDto {
  @ApiProperty({
    description: 'Unique device identifier (Android ID, iOS UDID, etc.)',
    example: '4b0f1c1d0da46637',
  })
  @IsString()
  deviceIdentifier: string;

  @ApiProperty({
    description: 'Device platform (android | ios | web)',
    example: 'android',
  })
  @IsString()
  platform: string;

  @ApiProperty({
    description: 'Operating system version',
    example: '14.0',
    required: false,
  })
  @IsString()
  @IsOptional()
  osVersion?: string;

  @ApiProperty({
    description: 'Device model',
    example: 'Pixel 7',
    required: false,
  })
  @IsString()
  @IsOptional()
  deviceModel?: string;

  @ApiProperty({
    description: 'Application version',
    example: '1.2.3',
    required: false,
  })
  @IsString()
  @IsOptional()
  appVersion?: string;
}
