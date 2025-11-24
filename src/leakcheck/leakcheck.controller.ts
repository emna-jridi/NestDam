import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { LeakcheckService } from './leakcheck.service';
import { LeakcheckResponseDto } from './dto/leakcheck-response.dto';
import { LeakcheckSummaryDto } from './dto/leakcheck-summary.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { Request } from 'express';
import type { JwtPayload } from '../auth/jwt.strategy';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiInternalServerErrorResponse,
  ApiBadGatewayResponse,
  ApiGatewayTimeoutResponse,
} from '@nestjs/swagger';

@ApiTags('leakcheck')
@Controller('leakcheck')
export class LeakcheckController {
  constructor(private readonly leakcheckService: LeakcheckService) {}
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Check authenticated user's email for leaks" })
  @ApiResponse({
    status: 200,
    description: 'Leakcheck result',
    type: LeakcheckResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - Invalid or missing JWT token',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 401 },
        message: { type: 'string', example: 'Unauthorized' },
      },
    },
  })
  @ApiInternalServerErrorResponse({
    description: 'Leakcheck service not configured',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 500 },
        message: {
          type: 'string',
          example:
            'Leakcheck service is not configured. Please contact support.',
        },
        error: { type: 'string', example: 'SERVICE_NOT_CONFIGURED' },
      },
    },
  })
  @ApiBadGatewayResponse({
    description: 'Leakcheck API error or service unavailable',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 502 },
        message: {
          type: 'string',
          example:
            'Leakcheck service is temporarily unavailable. Please try again later.',
        },
        error: { type: 'string', example: 'LEAKCHECK_SERVICE_UNAVAILABLE' },
      },
    },
  })
  @ApiGatewayTimeoutResponse({
    description: 'Leakcheck service request timed out',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 504 },
        message: {
          type: 'string',
          example:
            'Leakcheck service request timed out. Please try again later.',
        },
        error: { type: 'string', example: 'LEAKCHECK_TIMEOUT' },
      },
    },
  })
  async checkMe(
    @Req() req: Request & { user: JwtPayload },
  ): Promise<LeakcheckResponseDto> {
    const email = req.user.email;
    if (!email) {
      throw new Error('User email not found in JWT token');
    }
    return await this.leakcheckService.checkEmail(email);
  }
  @Get('me/summary')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Get compact leak summary for authenticated user's email",
  })
  @ApiResponse({
    status: 200,
    description: 'Leakcheck summary',
    type: LeakcheckSummaryDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - Invalid or missing JWT token',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 401 },
        message: { type: 'string', example: 'Unauthorized' },
      },
    },
  })
  @ApiInternalServerErrorResponse({
    description: 'Leakcheck service not configured',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 500 },
        message: {
          type: 'string',
          example:
            'Leakcheck service is not configured. Please contact support.',
        },
        error: { type: 'string', example: 'SERVICE_NOT_CONFIGURED' },
      },
    },
  })
  @ApiBadGatewayResponse({
    description: 'Leakcheck API error or service unavailable',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 502 },
        message: {
          type: 'string',
          example:
            'Leakcheck service is temporarily unavailable. Please try again later.',
        },
        error: { type: 'string', example: 'LEAKCHECK_SERVICE_UNAVAILABLE' },
      },
    },
  })
  @ApiGatewayTimeoutResponse({
    description: 'Leakcheck service request timed out',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 504 },
        message: {
          type: 'string',
          example:
            'Leakcheck service request timed out. Please try again later.',
        },
        error: { type: 'string', example: 'LEAKCHECK_TIMEOUT' },
      },
    },
  })
  async checkMeSummary(
    @Req() req: Request & { user: JwtPayload },
  ): Promise<LeakcheckSummaryDto> {
    const email = req.user.email;
    if (!email) {
      throw new Error('User email not found in JWT token');
    }
    return await this.leakcheckService.checkEmailSummary(email);
  }
}
