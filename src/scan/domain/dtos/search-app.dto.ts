import { IsString, IsEnum, IsOptional, IsNumber, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

// ============= Search App Request =============
export class SearchAppRequestDto {
  @IsString()
  query: string;

  @IsEnum(['android', 'ios'])
  platform: 'android' | 'ios';

  @IsOptional()
  @IsNumber()
  limit?: number;
}

// ============= Search Result Item =============
export class SearchResultDto {
  @IsString()
  packageName: string;

  @IsString()
  appName: string;

  @IsString()
  icon: string;

  @IsNumber()
  rating: number;

  @IsString()
  downloads: string;

  @IsString()
  developer: string;

  @IsNumber()
  predictedRiskScore: number;

  @IsEnum(['low', 'medium', 'high', 'critical'])
  predictedRiskLevel: 'low' | 'medium' | 'high' | 'critical';

  @IsArray()
  @IsString({ each: true })
  predictedRecommendations: string[];
}

// ============= Search Response =============
export class SearchAppResponseDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SearchResultDto)
  results: SearchResultDto[];
}

// ============= Scan History Item =============
export class ScanHistoryItemDto {
  @IsString()
  scanId: string;

  @IsEnum(['pending', 'analyzing', 'completed', 'failed'])
  status: 'pending' | 'analyzing' | 'completed' | 'failed';

  @IsNumber()
  totalApps: number;

  @IsNumber()
  scannedApps: number;

  @IsOptional()
  @IsNumber()
  averageScore?: number;

  @IsOptional()
  @IsNumber()
  highRiskApps?: number;

  @IsOptional()
  @IsNumber()
  mediumRiskApps?: number;

  @IsOptional()
  @IsNumber()
  lowRiskApps?: number;

  @IsString()
  createdAt: string;

  @IsOptional()
  @IsString()
  completedAt?: string;

  @IsOptional()
  @IsNumber()
  duration?: number;
}

// ============= Scan History Response =============
export class ScanHistoryResponseDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScanHistoryItemDto)
  scans: ScanHistoryItemDto[];

  @IsNumber()
  total: number;

  @IsNumber()
  limit: number;

  @IsNumber()
  offset: number;
}
