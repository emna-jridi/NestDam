
import { IsString, IsBoolean, IsArray, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class InstalledAppDto {
  @IsString()
  packageName: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  version?: string;

  @IsArray()
  @IsString({ each: true })
  permissions: string[];

  @IsBoolean()
  @IsOptional()
  isDebuggable?: boolean;
}

export class AnalyzeInstalledAppsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InstalledAppDto)
  apps: InstalledAppDto[];

  @IsString()
  @IsOptional()
  userHash?: string; // Hash anonyme de l'utilisateur
}