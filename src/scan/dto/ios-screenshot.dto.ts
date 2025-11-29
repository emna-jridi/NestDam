// src/scan/dto/ios-scan.dto.ts
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class IosAppDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  bundleId?: string;

  @IsOptional()
  @IsString()
  category?: string;
}

export class AnalyzeIosAppsDto {
  @IsString()
  userHash: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IosAppDto)
  apps: IosAppDto[];
}
