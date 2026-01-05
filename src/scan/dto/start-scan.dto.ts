import { IsString, IsOptional, IsEnum, ValidateIf } from 'class-validator';

export enum ScanLevel {
  SMART = 'SMART',
  DEEP = 'DEEP',
}

export enum AnalysisType {
  INSTALLED_APP = 'installed_app',
  APK_UPLOAD = 'apk_upload',
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
  level: ScanLevel = ScanLevel.SMART;

  /**
   * Derived on the backend when not provided:
   * - installed_app when scanning installed packages
   * - apk_upload when an APK file or URL is supplied
   */
  @IsEnum(AnalysisType)
  @IsOptional()
  analysisType?: AnalysisType;
}
