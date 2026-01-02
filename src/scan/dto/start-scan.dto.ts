import { IsString, IsOptional, IsEnum, ValidateIf, IsNotEmpty } from 'class-validator';

export enum ScanLevel {
  FAST = 'FAST',
  SMART = 'SMART',
  DEEP = 'DEEP',
}

export class StartScanDto {
  @IsOptional()
  @IsString()
  @ValidateIf((obj) => !obj.apkFile && !obj.apkUrl)
  packageName?: string;

  @IsOptional()
  @ValidateIf((obj) => !obj.packageName && !obj.apkUrl)
  apkFile?: Express.Multer.File;

  @IsOptional()
  @IsString()
  @ValidateIf((obj) => !obj.packageName && !obj.apkFile)
  apkUrl?: string;

  @IsEnum(ScanLevel)
  @IsOptional()
  level: ScanLevel = ScanLevel.FAST;
}
