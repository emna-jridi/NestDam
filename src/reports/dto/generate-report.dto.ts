import {
  IsEnum,
  IsOptional,
  IsBoolean,
  IsDateString,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GenerateReportDto {
  @ApiPropertyOptional({ description: 'Device ID to filter report' })
  @IsOptional()
  deviceId?: string;

  @ApiProperty({
    description: 'Time range for the report',
    enum: ['week', 'month', 'quarter', 'year', 'custom'],
    example: 'month',
  })
  @IsEnum(['week', 'month', 'quarter', 'year', 'custom'])
  timeRange: 'week' | 'month' | 'quarter' | 'year' | 'custom';

  @ApiPropertyOptional({
    description: 'Start date (required if timeRange is custom)',
    example: '2025-01-01T00:00:00Z',
  })
  @ValidateIf((o) => o.timeRange === 'custom')
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End date (required if timeRange is custom)',
    example: '2025-01-31T23:59:59Z',
  })
  @ValidateIf((o) => o.timeRange === 'custom')
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Include chart data in response',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  includeCharts?: boolean = true;

  @ApiProperty({
    description: 'Report format',
    enum: ['pdf', 'json', 'html'],
    example: 'json',
  })
  @IsEnum(['pdf', 'json', 'html'])
  format: 'pdf' | 'json' | 'html';

  @ApiPropertyOptional({
    description: 'Include AI recommendations',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  includeRecommendations?: boolean = true;
}


