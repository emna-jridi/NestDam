import { IsString, IsEnum, IsOptional, IsNumber, IsArray, IsDateString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

// ============= Permission DTO =============
export class PermissionDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  translation?: string;

  @IsOptional()
  @IsEnum(['normal', 'dangerous', 'signature'])
  riskLevel?: 'normal' | 'dangerous' | 'signature';

  @IsOptional()
  @IsString()
  explanation?: string;
}

// ============= Tracker DTO =============
export class TrackerDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsEnum(['low', 'medium', 'high'])
  risk?: 'low' | 'medium' | 'high';
}

// ============= Store Data DTO =============
export class StoreDataDto {
  @IsOptional()
  @IsNumber()
  rating?: number;

  @IsOptional()
  @IsString()
  downloads?: string;

  @IsOptional()
  @IsString()
  developer?: string;

  @IsOptional()
  @IsString()
  lastUpdate?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

// ============= Scan Results DTO =============
export class ScanResultsDto {
  @IsNumber()
  aiRiskScore: number;

  @IsEnum(['low', 'medium', 'high', 'critical'])
  aiRiskLevel: 'low' | 'medium' | 'high' | 'critical';

  @IsString()
  aiSummary: string;

  @IsArray()
  @IsString({ each: true })
  aiRecommendations: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PermissionDto)
  permissions?: PermissionDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TrackerDto)
  trackers?: TrackerDto[];

  @IsOptional()
  @IsNumber()
  permissionsScore?: number;

  @IsOptional()
  @IsNumber()
  trackersScore?: number;
}

// ============= Final Score DTO =============
export class FinalScoreDto {
  @IsNumber()
  score: number;

  @IsNumber()
  storeWeight: number;

  @IsNumber()
  ollamaWeight: number;

  @IsString()
  breakdown: string;
}

// ============= Full App DTO =============
export class AppDto {
  @IsString()
  id: string;

  @IsString()
  packageName: string;

  @IsString()
  appName: string;

  @IsOptional()
  @IsString()
  version?: string;

  @IsEnum(['android', 'ios'])
  platform: 'android' | 'ios';

  @IsOptional()
  @IsDateString()
  installedDate?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => StoreDataDto)
  storeData?: StoreDataDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ScanResultsDto)
  scanResults?: ScanResultsDto;

  @IsOptional()
  @IsNumber()
  finalScore?: number;

  @IsOptional()
  @IsDateString()
  lastScanned?: string;

  @IsOptional()
  @IsString()
  fileName?: string;

  @IsOptional()
  @IsString()
  mobsfHash?: string;

  @IsOptional()
  @IsString()
  scanType?: string;
}

// ============= App Details Response DTO =============
export class AppDetailsResponseDto {
  @ValidateNested()
  @Type(() => AppDto)
  app: AppDto;

  @IsOptional()
  @IsArray()
  history?: Array<{
    scanDate: string;
    score: number;
    riskLevel: string;
  }>;
}

// ============= Interfaces for internal use =============
export interface IPermission {
  name: string;
  translation?: string;
  riskLevel?: 'normal' | 'dangerous' | 'signature';
  explanation?: string;
}

export interface ITracker {
  name: string;
  category?: string;
  risk?: 'low' | 'medium' | 'high';
}

export interface IStoreData {
  rating?: number;
  downloads?: string;
  developer?: string;
  lastUpdate?: Date;
  icon?: string;
  description?: string;
}

export interface IScanResults {
  aiRiskScore: number;
  aiRiskLevel: 'low' | 'medium' | 'high' | 'critical';
  aiSummary: string;
  aiRecommendations: string[];
  permissions?: IPermission[];
  trackers?: ITracker[];
}

export interface IFinalScore {
  score: number;
  storeWeight: number;
  ollamaWeight: number;
  breakdown: string;
}
