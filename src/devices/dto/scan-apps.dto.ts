import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
} from 'class-validator';

export class ScanAppDto {
  @ApiProperty({ example: 'com.example.app' })
  @IsString()
  @IsNotEmpty()
  packageName: string;

  @ApiProperty({ example: 12, required: false })
  @IsOptional()
  @IsNumber()
  versionCode?: number;

  @ApiProperty({ example: '1.2.3', required: false })
  @IsOptional()
  @IsString()
  versionName?: string;
}

export class ScanAppsDto {
  @ApiProperty({ type: [ScanAppDto] })
  @IsArray()
  apps: ScanAppDto[];
}
