import {
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
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
import { InsightsService } from './insights.service';
import {
  WeeklyInsightsQueryDto,
  WeeklyInsightsResponseDto,
} from './dto/weekly-insights.dto';
import {
  MonthlyInsightsQueryDto,
  MonthlyInsightsResponseDto,
} from './dto/monthly-insights.dto';
import {
  RecommendationsQueryDto,
  RecommendationsResponseDto,
} from './dto/recommendations.dto';

@ApiTags('insights')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('insights')
export class InsightsController {
  constructor(private readonly insightsService: InsightsService) {}

  @Get('weekly')
  @ApiOperation({ summary: 'Get weekly security insights' })
  @ApiResponse({
    status: 200,
    description: 'Weekly insights retrieved successfully',
    type: WeeklyInsightsResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getWeeklyInsights(
    @Req() req: any,
    @Query() query: WeeklyInsightsQueryDto,
  ): Promise<WeeklyInsightsResponseDto> {
    try {
      const userId = req.user.userId;
      const forceRefresh = query.forceRefresh === true;
      return await this.insightsService.getWeeklyInsights(
        userId,
        query.deviceId,
        query.week,
        query.includeRecommendations !== false,
        forceRefresh,
      );
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }

  @Get('monthly')
  @ApiOperation({ summary: 'Get monthly security insights' })
  @ApiResponse({
    status: 200,
    description: 'Monthly insights retrieved successfully',
    type: MonthlyInsightsResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMonthlyInsights(
    @Req() req: any,
    @Query() query: MonthlyInsightsQueryDto,
  ): Promise<MonthlyInsightsResponseDto> {
    try {
      const userId = req.user.userId;
      const forceRefresh = query.forceRefresh === true;
      return await this.insightsService.getMonthlyInsights(
        userId,
        query.deviceId,
        query.month,
        query.includeRecommendations !== false,
        forceRefresh,
      );
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }

  @Get('recommendations')
  @ApiOperation({ summary: 'Get AI-powered security recommendations' })
  @ApiResponse({
    status: 200,
    description: 'Recommendations retrieved successfully',
    type: RecommendationsResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getRecommendations(
    @Req() req: any,
    @Query() query: RecommendationsQueryDto,
  ): Promise<RecommendationsResponseDto> {
    try {
      const userId = req.user.userId;
      return await this.insightsService.getRecommendations(
        userId,
        query.deviceId,
        query.limit || 10,
        query.priority || 'all',
        query.category,
      );
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }
}
