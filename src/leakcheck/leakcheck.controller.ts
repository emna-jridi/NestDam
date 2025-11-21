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
  async checkMe(
    @Req() req: Request & { user: JwtPayload },
  ): Promise<LeakcheckResponseDto> {
    const email = req.user.email;
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
  async checkMeSummary(
    @Req() req: Request & { user: JwtPayload },
  ): Promise<LeakcheckSummaryDto> {
    const email = req.user.email;
    return await this.leakcheckService.checkEmailSummary(email);
  }
}
