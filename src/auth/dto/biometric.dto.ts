import { IsString, IsNotEmpty, IsOptional, IsEnum, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterBiometricDeviceDto {
  @ApiProperty({
    description: 'Unique device identifier (UUID)',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsString()
  @IsNotEmpty()
  deviceId: string;

  @ApiProperty({
    description: 'PEM-encoded public key (RSA-2048 or EC P-256)',
    example: '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A...\n-----END PUBLIC KEY-----',
  })
  @IsString()
  @IsNotEmpty()
  publicKey: string;

  @ApiProperty({
    description: 'Key algorithm type',
    enum: ['RSA', 'EC'],
    example: 'EC',
  })
  @IsEnum(['RSA', 'EC'])
  keyType: string;

  @ApiProperty({
    description: 'Human-readable device name',
    example: 'Samsung Galaxy S24 Ultra',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  deviceName: string;

  @ApiPropertyOptional({
    description: 'Device platform',
    enum: ['android', 'ios'],
    example: 'android',
  })
  @IsOptional()
  @IsEnum(['android', 'ios'])
  platform?: string;

  @ApiPropertyOptional({
    description: 'Operating system version',
    example: 'Android 14',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  osVersion?: string;

  @ApiPropertyOptional({
    description: 'App version',
    example: '1.0.0',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  appVersion?: string;
}

export class RequestChallengeDto {
  @ApiProperty({
    description: 'Device ID to request challenge for',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsString()
  @IsNotEmpty()
  deviceId: string;
}

export class VerifyBiometricDto {
  @ApiProperty({
    description: 'Device ID',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsString()
  @IsNotEmpty()
  deviceId: string;

  @ApiProperty({
    description: 'The challenge that was signed',
    example: 'abc123def456...',
  })
  @IsString()
  @IsNotEmpty()
  challenge: string;

  @ApiProperty({
    description: 'Base64-encoded signature of the challenge',
    example: 'MEUCIQC7yWYM...',
  })
  @IsString()
  @IsNotEmpty()
  signature: string;
}

export class RevokeDeviceDto {
  @ApiPropertyOptional({
    description: 'Reason for revoking the device',
    example: 'Device lost or stolen',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
