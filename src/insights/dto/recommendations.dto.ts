import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsEnum,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RecommendationsQueryDto {
  @ApiPropertyOptional({ description: 'Device ID to filter recommendations' })
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiPropertyOptional({
    description: 'Maximum number of recommendations',
    default: 10,
    minimum: 1,
    maximum: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number = 10;

  @ApiPropertyOptional({
    description: 'Filter by priority',
    enum: ['high', 'medium', 'low', 'all'],
    default: 'all',
  })
  @IsOptional()
  @IsEnum(['high', 'medium', 'low', 'all'])
  priority?: 'high' | 'medium' | 'low' | 'all' = 'all';

  @ApiPropertyOptional({
    description: 'Filter by category',
    example: 'permissions',
  })
  @IsOptional()
  @IsString()
  category?: string;
}

export class RecommendationImpactDto {
  @ApiPropertyOptional({ example: 5 })
  privacyScoreIncrease?: number;

  @ApiPropertyOptional({ example: 'Medium' })
  batterySavings?: string;

  @ApiPropertyOptional({ example: 'High' })
  privacyImprovement?: string;
}

export class RelatedAppDto {
  @ApiProperty({ example: 'ExampleApp1' })
  appName: string;

  @ApiProperty({ example: 'com.example.app1' })
  packageName: string;

  @ApiProperty({ example: 'medium', enum: ['high', 'medium', 'low', 'safe'] })
  riskLevel: string;
}

export class RecommendationResponseDto {
  @ApiProperty({ example: 'rec_123' })
  id: string;

  @ApiProperty({ example: 'high', enum: ['high', 'medium', 'low'] })
  priority: string;

  @ApiProperty({ example: 'permissions' })
  category: string;

  @ApiProperty({ example: 'Revoke Unnecessary Location Access' })
  title: string;

  @ApiProperty({
    example:
      '5 apps are accessing your location in the background. Review and revoke access for apps that don\'t need it.',
  })
  description: string;

  @ApiPropertyOptional({
    example:
      'Apps like ExampleApp1, ExampleApp2 are accessing your location even when not in use. This can drain battery and compromise privacy.',
  })
  detailedDescription?: string;

  @ApiPropertyOptional({ example: '/permissions?filter=location' })
  actionUrl?: string;

  @ApiPropertyOptional({ type: RecommendationImpactDto })
  impact?: RecommendationImpactDto;

  @ApiPropertyOptional({
    type: [String],
    example: [
      'Go to Settings > Permissions',
      'Select Location',
      'Review apps with location access',
      'Revoke access for unnecessary apps',
    ],
  })
  steps?: string[];

  @ApiPropertyOptional({ type: [RelatedAppDto] })
  relatedApps?: RelatedAppDto[];

  @ApiProperty({ example: '2025-01-15T10:30:00Z' })
  generatedAt: string;
}

export class RecommendationsSummaryDto {
  @ApiProperty({ example: 10 })
  total: number;

  @ApiProperty({ example: 3 })
  high: number;

  @ApiProperty({ example: 5 })
  medium: number;

  @ApiProperty({ example: 2 })
  low: number;
}

export class RecommendationsResponseDto {
  @ApiProperty({ type: [RecommendationResponseDto] })
  recommendations: RecommendationResponseDto[];

  @ApiProperty({ type: RecommendationsSummaryDto })
  summary: RecommendationsSummaryDto;
}


