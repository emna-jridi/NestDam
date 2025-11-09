import { IsString, IsOptional, IsNumber, IsObject } from 'class-validator';

export class CreateScanDto {
  @IsString()
  type: string; // 'apk' or 'metadata'

  @IsOptional()
  @IsString()
  packageName?: string;

  @IsOptional()
  @IsString()
  fileName?: string;

  @IsOptional()
  @IsNumber()
  score?: number;

  @IsOptional()
  @IsObject()
  report?: Record<string, any>; // MobSF report or metadata analysis
}
