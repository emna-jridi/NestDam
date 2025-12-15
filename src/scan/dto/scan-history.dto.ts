import { IsOptional, IsNumber, IsString, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ScanHistoryQueryDto {
  @ApiProperty({
    description: 'Filter by last N days (7, 30, 90, or null for all time)',
    required: false,
    example: 30,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  days?: number;

  @ApiProperty({
    description: 'Start date in ISO8601 format',
    required: false,
    example: '2025-01-01T00:00:00Z',
  })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiProperty({
    description: 'End date in ISO8601 format',
    required: false,
    example: '2025-01-15T23:59:59Z',
  })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiProperty({
    description: 'Number of results per page',
    required: false,
    default: 50,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiProperty({
    description: 'Offset for pagination',
    required: false,
    default: 0,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  offset?: number;
}

export class ScanHistoryEntryDto {
  id: string;
  timestamp: string;
  privacyScore: number;
  totalApps: number;
  riskyApps: number;
  safeApps: number;
  mediumRiskApps: number;
  highRiskApps: number;
  riskDistribution: {
    high: number;
    medium: number;
    low: number;
    safe: number;
  };
  scanDuration?: number;
}

export class ScanHistorySummaryDto {
  totalScans: number;
  averageScore: number;
  scoreTrend: 'up' | 'down' | 'stable';
  scoreChange: number;
  firstScanDate: string | null;
  lastScanDate: string | null;
}

export class ScanHistoryResponseDto {
  scans: ScanHistoryEntryDto[];
  summary: ScanHistorySummaryDto;
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}
