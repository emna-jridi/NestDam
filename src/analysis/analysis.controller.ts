import {
  Controller,
  Get,
  Query,
  UseGuards,
  Req,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AnalysisService } from './analysis.service';
import {
  PermissionAnalyticsQueryDto,
  PermissionAnalyticsResponseDto,
} from './dto/permission-analytics.dto';

@ApiTags('Analysis')
@Controller('permissions')
export class AnalysisController {
  constructor(private readonly analysisService: AnalysisService) {}

  @Get('analytics')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Get permission usage analytics and dangerous permission statistics',
  })
  @ApiResponse({
    status: 200,
    description: 'Permission analytics retrieved successfully',
    type: PermissionAnalyticsResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getPermissionAnalytics(
    @Req() req: any,
    @Query() query: PermissionAnalyticsQueryDto,
  ) {
    try {
      const userId = req.user.userId;
      return await this.analysisService.getPermissionAnalytics(
        userId,
        query.platform,
        query.days || 30,
      );
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }
}
