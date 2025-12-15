import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsBoolean, IsString } from 'class-validator';

export class WeeklyInsightsQueryDto {
  @ApiPropertyOptional({ description: 'Device ID to filter insights' })
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiPropertyOptional({
    description: 'ISO8601 date (any date in the week), defaults to current week',
    example: '2025-01-15',
  })
  @IsOptional()
  @IsString()
  week?: string;

  @ApiPropertyOptional({
    description: 'Include AI recommendations',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  includeRecommendations?: boolean = true;
}

export class PrivacyScoreDto {
  @ApiProperty({ example: 72 })
  current: number;

  @ApiProperty({ example: 70 })
  previous: number;

  @ApiProperty({ example: 2 })
  change: number;

  @ApiProperty({ example: 'up', enum: ['up', 'down', 'stable'] })
  trend: 'up' | 'down' | 'stable';
}

export class WeeklySummaryDto {
  @ApiProperty({ type: PrivacyScoreDto })
  privacyScore: PrivacyScoreDto;

  @ApiProperty({ example: 3 })
  scans: number;

  @ApiProperty({ example: 1 })
  newRisks: number;

  @ApiProperty({ example: 2 })
  resolvedRisks: number;

  @ApiProperty({ example: 12 })
  appsScanned: number;
}

export class HighlightDto {
  @ApiProperty({ example: 'improvement', enum: ['improvement', 'warning', 'info'] })
  type: string;

  @ApiProperty({ example: 'Privacy Score Improved' })
  title: string;

  @ApiProperty({ example: 'Your privacy score increased by 2 points this week' })
  description: string;

  @ApiProperty({ example: 'trending-up' })
  icon: string;
}

export class TopRiskDto {
  @ApiProperty({ example: 'Example App' })
  appName: string;

  @ApiProperty({ example: 'com.example.app' })
  packageName: string;

  @ApiProperty({ example: 'high', enum: ['high', 'medium', 'low'] })
  riskLevel: string;

  @ApiProperty({ example: 'Multiple dangerous permissions detected' })
  description: string;

  @ApiProperty({ example: '2025-01-10T08:00:00Z' })
  firstDetected: string;
}

export class RecommendationDto {
  @ApiProperty({ example: 'high', enum: ['high', 'medium', 'low'] })
  priority: string;

  @ApiProperty({ example: 'permissions' })
  category: string;

  @ApiProperty({ example: 'Revoke Location Permission' })
  title: string;

  @ApiProperty({ example: '5 apps are accessing your location unnecessarily' })
  description: string;

  @ApiPropertyOptional({ example: '/permissions' })
  actionUrl?: string;

  @ApiPropertyOptional()
  impact?: {
    privacyScoreIncrease?: number;
    batterySavings?: string;
    privacyImprovement?: string;
  };
}

export class WeeklyTrendsDto {
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

  @ApiProperty({
    type: 'array',
    items: {
      type: 'object',
      properties: {
        date: { type: 'string', format: 'date' },
        count: { type: 'number' },
      },
    },
  })
  riskCount: Array<{ date: string; count: number }>;
}

export class WeeklyInsightsResponseDto {
  @ApiProperty()
  week: {
    startDate: string;
    endDate: string;
    weekNumber: number;
  };

  @ApiProperty({ type: WeeklySummaryDto })
  summary: WeeklySummaryDto;

  @ApiProperty({ type: [HighlightDto] })
  highlights: HighlightDto[];

  @ApiProperty({ type: [TopRiskDto] })
  topRisks: TopRiskDto[];

  @ApiProperty({ type: [RecommendationDto] })
  recommendations: RecommendationDto[];

  @ApiProperty({ type: WeeklyTrendsDto })
  trends: WeeklyTrendsDto;
}


