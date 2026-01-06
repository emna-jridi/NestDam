import { IsString, IsArray, IsOptional, IsEnum, ValidateNested, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

// Platform enum for iOS/Android distinction
export enum Platform {
  IOS = 'ios',
  ANDROID = 'android',
}

// DTO for individual app in batch scan
export class BatchAppDto {
  @ApiProperty({ description: 'Package name or bundle ID', example: 'com.example.app' })
  @IsString()
  packageName: string;

  @ApiProperty({ description: 'App display name', example: 'Example App', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ description: 'App version', example: '1.0.0', required: false })
  @IsOptional()
  @IsString()
  version?: string;

  @ApiProperty({ description: 'App permissions (Android)', required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];

  @ApiProperty({ description: 'App category', example: 'Social', required: false })
  @IsOptional()
  @IsString()
  category?: string;
}

// Request DTO for batch scan
export class BatchScanDto {
  @ApiProperty({ description: 'User hash/ID for tracking', example: 'user123' })
  @IsString()
  userHash: string;

  @ApiProperty({ 
    description: 'List of apps to scan',
    type: [BatchAppDto],
    minItems: 1
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BatchAppDto)
  apps: BatchAppDto[];

  @ApiProperty({ 
    description: 'Platform (ios or android)',
    enum: Platform,
    default: Platform.ANDROID
  })
  @IsOptional()
  @IsEnum(Platform)
  platform?: Platform = Platform.ANDROID;
}

// Individual app result in batch response
export class BatchAppResultDto {
  @ApiProperty({ description: 'Package name or bundle ID' })
  packageName: string;

  @ApiProperty({ description: 'App display name' })
  name: string;

  @ApiProperty({ description: 'App version', required: false })
  version?: string;

  @ApiProperty({ description: 'Security score (0-100)' })
  score: number;

  @ApiProperty({ description: 'Risk level', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] })
  riskLevel: string;

  @ApiProperty({ description: 'List of alerts/warnings' })
  alerts: string[];

  @ApiProperty({ description: 'Detected trackers' })
  trackers: string[];

  @ApiProperty({ description: 'Permission info' })
  permissions: {
    dangerous: string[];
    total: number;
  };

  @ApiProperty({ description: 'Score breakdown by category', required: false })
  breakdown?: Record<string, { penalty: number; count: number; list: string[] }>;
}

// Risk distribution summary
export class RiskDistributionDto {
  @ApiProperty({ description: 'Number of critical risk apps' })
  critical: number;

  @ApiProperty({ description: 'Number of high risk apps' })
  high: number;

  @ApiProperty({ description: 'Number of medium risk apps' })
  medium: number;

  @ApiProperty({ description: 'Number of low risk apps' })
  low: number;
}

// Summary of batch scan
export class BatchScanSummaryDto {
  @ApiProperty({ description: 'Average score across all apps' })
  avgScore: number;

  @ApiProperty({ description: 'Risk distribution' })
  riskDistribution: RiskDistributionDto;

  @ApiProperty({ description: 'Total number of alerts' })
  totalAlerts: number;

  @ApiProperty({ description: 'Most dangerous apps', required: false })
  mostDangerousApps?: { packageName: string; name: string; score: number }[];
}

// Response DTO for batch scan
export class BatchScanResultDto {
  @ApiProperty({ description: 'Unique scan ID' })
  scanId: string;

  @ApiProperty({ description: 'User hash/ID' })
  userHash: string;

  @ApiProperty({ description: 'Total apps scanned' })
  totalApps: number;

  @ApiProperty({ description: 'Individual app results', type: [BatchAppResultDto] })
  results: BatchAppResultDto[];

  @ApiProperty({ description: 'Scan summary' })
  summary: BatchScanSummaryDto;

  @ApiProperty({ description: 'Scan timestamp' })
  createdAt: string;

  @ApiProperty({ description: 'Platform scanned', enum: Platform })
  platform: Platform;
}
