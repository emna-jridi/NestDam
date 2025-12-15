import { IsString, IsOptional, IsNumber, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateAlertDto {
  @ApiProperty({
    description: 'Package name of the app that triggered the alert',
    example: 'com.example.app',
  })
  @IsString()
  packageName: string;

  @ApiProperty({
    description: 'Event description',
    example: 'Camera accessed in background',
  })
  @IsString()
  event: string;

  @ApiProperty({
    description: 'Unix timestamp when the event occurred',
    example: 1700000000000,
  })
  @IsNumber()
  timestamp: number;

  @ApiProperty({
    description: 'Device ID (optional, for device-specific alerts)',
    example: '507f1f77bcf86cd799439011',
    required: false,
  })
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiProperty({
    description: 'Additional event details',
    required: false,
  })
  @IsOptional()
  @IsObject()
  details?: Record<string, any>;
}
