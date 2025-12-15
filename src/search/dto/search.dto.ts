import {
  IsString,
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsEnum,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum SearchType {
  APPS = 'apps',
  ALERTS = 'alerts',
  TIPS = 'tips',
  ALL = 'all',
}

export class SearchQueryDto {
  @ApiProperty({
    description: 'Search query string',
    example: 'camera',
  })
  @IsString()
  query: string;

  @ApiProperty({
    description: 'Type of content to search',
    enum: SearchType,
    default: SearchType.ALL,
    required: false,
  })
  @IsOptional()
  @IsEnum(SearchType)
  type?: SearchType;

  @ApiProperty({
    description: 'Number of results per type',
    required: false,
    default: 20,
    minimum: 1,
    maximum: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50)
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

export class AppSearchResultDto {
  packageName: string;
  name: string;
  icon?: string;
  riskLevel: string;
  matchType: 'name' | 'package' | 'permission';
}

export class AlertSearchResultDto {
  id: string;
  title: string;
  appName: string;
  severity: string;
  timestamp: number;
}

export class TipSearchResultDto {
  id: string;
  title: string;
  category: string;
  excerpt: string;
}

export class SearchResultsDto {
  apps: AppSearchResultDto[];
  alerts: AlertSearchResultDto[];
  tips: TipSearchResultDto[];
}

export class SearchResponseDto {
  query: string;
  results: SearchResultsDto;
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}
