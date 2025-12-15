import { IsOptional, IsString, IsNumber, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class PermissionAnalyticsQueryDto {
  @ApiProperty({
    description: 'Filter by platform',
    required: false,
    enum: ['android', 'ios'],
  })
  @IsOptional()
  @IsString()
  platform?: 'android' | 'ios';

  @ApiProperty({
    description: 'Last N days to analyze',
    required: false,
    default: 30,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  days?: number;
}

export class DangerousPermissionDto {
  permission: string;
  displayName: string;
  appCount: number;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  description: string;
}

export class PermissionUsageDto {
  permission: string;
  usageCount: number;
  lastUsed: string;
  apps: Array<{
    packageName: string;
    appName: string;
    usageCount: number;
  }>;
}

export class PermissionAnalyticsSummaryDto {
  totalDangerousPermissions: number;
  totalAppsWithDangerousPermissions: number;
  mostUsedPermission: string;
  averagePermissionsPerApp: number;
}

export class PermissionAnalyticsResponseDto {
  dangerousPermissions: DangerousPermissionDto[];
  permissionUsage: PermissionUsageDto[];
  summary: PermissionAnalyticsSummaryDto;
}
