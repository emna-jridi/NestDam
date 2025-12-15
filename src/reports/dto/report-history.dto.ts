import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class ReportHistoryQueryDto {
  @ApiPropertyOptional({
    description: 'Maximum number of reports to return',
    default: 20,
    minimum: 1,
    maximum: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Offset for pagination',
    default: 0,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;

  @ApiPropertyOptional({
    description: 'Filter by report format',
    enum: ['pdf', 'json', 'html', 'all'],
    default: 'all',
  })
  @IsOptional()
  @IsEnum(['pdf', 'json', 'html', 'all'])
  format?: 'pdf' | 'json' | 'html' | 'all' = 'all';
}

export class ReportHistoryItemDto {
  @ApiProperty({ example: 'report_123456' })
  reportId: string;

  @ApiProperty({ example: '2025-01-15T10:30:00Z' })
  generatedAt: string;

  @ApiProperty({ example: 'month', enum: ['week', 'month', 'quarter', 'year', 'custom'] })
  timeRange: string;

  @ApiProperty({ example: 'pdf', enum: ['pdf', 'json', 'html'] })
  format: string;

  @ApiPropertyOptional({ example: 'https://api.example.com/reports/report_123456.pdf' })
  downloadUrl?: string;

  @ApiPropertyOptional({ example: 245678, description: 'File size in bytes' })
  size?: number;

  @ApiProperty()
  summary: {
    privacyScore: number;
    totalScans: number;
  };
}

export class ReportHistoryPaginationDto {
  @ApiProperty({ example: 15 })
  total: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 0 })
  offset: number;

  @ApiProperty({ example: false })
  hasMore: boolean;
}

export class ReportHistoryResponseDto {
  @ApiProperty({ type: [ReportHistoryItemDto] })
  reports: ReportHistoryItemDto[];

  @ApiProperty({ type: ReportHistoryPaginationDto })
  pagination: ReportHistoryPaginationDto;
}

