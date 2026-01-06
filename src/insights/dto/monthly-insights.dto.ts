import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsBoolean, IsString } from 'class-validator';

export class MonthlyInsightsQueryDto {
  @ApiPropertyOptional({ description: 'Device ID to filter insights' })
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiPropertyOptional({
    description: 'YYYY-MM format, defaults to current month',
    example: '2025-01',
  })
  @IsOptional()
  @IsString()
  month?: string;

  @ApiPropertyOptional({
    description: 'Include AI recommendations',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  includeRecommendations?: boolean = true;

  @ApiPropertyOptional({
    description: 'Force refresh (bypass cache)',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  forceRefresh?: boolean = false;
}

export class MonthlySummaryDto {
  @ApiProperty()
  privacyScore: {
    current: number;
    previous: number;
    change: number;
    trend: 'up' | 'down' | 'stable';
  };

  @ApiProperty({ example: 12 })
  scans: number;

  @ApiProperty({ example: 5 })
  newRisks: number;

  @ApiProperty({ example: 8 })
  resolvedRisks: number;

  @ApiProperty({ example: 47 })
  appsScanned: number;

  @ApiProperty({ example: '3 per week' })
  averageScanFrequency: string;
}

export class AchievementDto {
  @ApiProperty({ example: 'Consistent Scanner' })
  title: string;

  @ApiProperty({ example: 'Scanned your device 12 times this month' })
  description: string;

  @ApiProperty({ example: 'award' })
  icon: string;
}

export class MonthlyTrendsDto {
  @ApiProperty({
    type: 'array',
    items: {
      type: 'object',
      properties: {
        date: { type: 'string', format: 'date' },
        score: { type: 'number' },
      },
    },
  })
  privacyScore: Array<{ date: string; score: number }>;

  @ApiProperty()
  riskDistribution: {
    high: number;
    medium: number;
    low: number;
    safe: number;
  };
}

export class MonthlyInsightsResponseDto {
  @ApiProperty()
  month: {
    year: number;
    month: number;
    startDate: string;
    endDate: string;
  };

  @ApiProperty({ type: MonthlySummaryDto })
  summary: MonthlySummaryDto;

  @ApiProperty({ type: 'array', items: { type: 'object' } })
  highlights: any[];

  @ApiProperty({ type: 'array', items: { type: 'object' } })
  topRisks: any[];

  @ApiProperty({ type: 'array', items: { type: 'object' } })
  recommendations: any[];

  @ApiProperty({ type: MonthlyTrendsDto })
  trends: MonthlyTrendsDto;

  @ApiProperty({ type: [AchievementDto] })
  achievements: AchievementDto[];
}
