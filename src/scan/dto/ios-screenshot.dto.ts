
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class IosAppDto {
  @IsString()
  name: string;

  @IsString()
  version: string;  

  @IsString()
  bundleId: string;  

  @IsOptional()
  @IsArray()
  permissions?: string[];

  @IsOptional()
  @IsArray()
  trackers?: string[];

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
