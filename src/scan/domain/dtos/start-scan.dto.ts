import { IsArray, IsBoolean, IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class StartScanAppDto {
  @IsString()
  packageName: string;

  @IsString()
  displayName: string;

  @IsOptional()
  @IsString()
  category?: string;
}

export class StartScanRequestDto {
  @IsString()
  deviceId: string;

  @IsEnum(['android', 'ios'])
  platform: 'android' | 'ios';

  @IsBoolean()
  includeSystemApps: boolean;

  @IsArray()
  apps: StartScanAppDto[];

  @IsString()
  userId: string;

  @IsDateString()
  timestamp: string;
}
