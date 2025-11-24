import {
  Controller,
  Get,
  Query,
  UseGuards,
  Req,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrivacyTipsService } from './privacy-tips.service';
import type { Request } from 'express';
import type { JwtPayload } from '../auth/jwt.strategy';
import { PrivacyTipsListResponseDto } from './dto/privacy-tips-list-response.dto';
import { DailyTipResponseDto } from './dto/daily-tip-response.dto';
import { PersonalizedTipsListResponseDto } from './dto/personalized-tips-response.dto';

@ApiTags('privacy-tips')
@Controller('privacy-tips')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PrivacyTipsController {
  constructor(private readonly privacyTipsService: PrivacyTipsService) {}

  @Get()
  @ApiOperation({
    summary: 'Get privacy tips',
    description:
      'Retrieves a list of privacy tips with optional filtering by category and pagination.',
  })
  @ApiQuery({
    name: 'category',
    required: false,
    enum: ['permissions', 'data_protection', 'app_security', 'general'],
    description: 'Filter tips by category',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of results to return (default: 20)',
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    type: Number,
    description: 'Pagination offset (default: 0)',
  })
  @ApiResponse({
    status: 200,
    description: 'Privacy tips retrieved successfully',
    type: PrivacyTipsListResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async getTips(
    @Query('category') category?: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset?: number,
  ) {
    return this.privacyTipsService.findAll({ category, limit, offset });
  }

  @Get('daily')
  @ApiOperation({
    summary: 'Get daily privacy tip',
    description:
      'Retrieves the daily privacy tip. The tip rotates based on the current date.',
  })
  @ApiResponse({
    status: 200,
    description: 'Daily tip retrieved successfully',
    type: DailyTipResponseDto,
  })
  @ApiResponse({ status: 404, description: 'No tips available' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async getDailyTip() {
    return this.privacyTipsService.getDailyTip();
  }

  @Get('personalized')
  @ApiOperation({
    summary: 'Get personalized privacy tips (AI-powered)',
    description:
      "Retrieves AI-generated personalized privacy tips based on the user's privacy data, scan history, and app usage. Results are cached for 24 hours. Use forceRegenerate=true to bypass cache and generate new tips.",
  })
  @ApiQuery({
    name: 'forceRegenerate',
    required: false,
    type: Boolean,
    description: 'If true, bypasses cache and generates new tips',
    example: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Personalized tips retrieved successfully',
    type: PersonalizedTipsListResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async getPersonalizedTips(
    @Req() req: Request & { user: JwtPayload },
    @Query('forceRegenerate') forceRegenerate?: string,
  ) {
    const userId = req.user.userId;
    const shouldForceRegenerate = forceRegenerate === 'true';
    return this.privacyTipsService.getPersonalizedTips(
      userId,
      shouldForceRegenerate,
    );
  }
}
