import { IsString, IsArray, IsBoolean, IsOptional } from 'class-validator';

export class MetadataDto {
  @IsString()
  packageName: string;

  @IsArray()
  permissions: string[];

  @IsBoolean()
  isDebuggable: boolean;

  @IsOptional()
  @IsBoolean()
  exported?: boolean;
}
