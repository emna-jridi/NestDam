import { IsString, IsEnum, IsNumber, IsOptional, IsDateString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ScanResultsSummaryDto {
  @IsNumber()
  totalScanned: number;

  @IsNumber()
  highRiskApps: number;

  @IsNumber()
  mediumRiskApps: number;

  @IsNumber()
  lowRiskApps: number;

  @IsNumber()
  averageScore: number;
}

export class ScanStatusResponseDto {
  @IsString()
  scanId: string;

  @IsEnum(['pending', 'analyzing', 'completed', 'failed'])
  status: 'pending' | 'analyzing' | 'completed' | 'failed';

  @IsOptional()
  @IsNumber()
  progress?: number;

  @IsOptional()
  @IsNumber()
  totalApps?: number;

  @IsOptional()
  @IsNumber()
  scannedApps?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => ScanResultsSummaryDto)
  results?: ScanResultsSummaryDto;
}

export class ScanResponseDto {
  @IsString()
  scanId: string;

  @IsEnum(['pending', 'analyzing', 'completed', 'failed'])
  status: 'pending' | 'analyzing' | 'completed' | 'failed';

  @IsString()
  userId: string;

  @IsString()
  deviceId: string;

  @IsString()
  platform: 'android' | 'ios';

  @IsDateString()
  createdAt: string;
}

export class AppResultDto {
  @IsString()
  packageName: string;

  @IsString()
  appName: string;

  @IsNumber()
  finalScore: number;

  @IsOptional()
  @IsDateString()
  lastScanned?: string;
}

export class LatestScanResponseDto {
  @ValidateNested({ each: true })
  @Type(() => AppResultDto)
  apps: AppResultDto[];

  @IsNumber()
  globalScore: number;

  @IsDateString()
  createdAt: string;
}
