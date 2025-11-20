import { IsString, IsOptional, IsNumber, IsObject } from 'class-validator';

export class CreateAlertDto {
  @IsString()
  packageName: string;

  @IsString()
  event: string;

  @IsNumber()
  timestamp: number;

  @IsOptional()
  @IsObject()
  details?: Record<string, any>;
}
