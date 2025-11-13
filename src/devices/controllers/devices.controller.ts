import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Get,
  UseGuards,
  Req,
  Param,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtPayload } from '../../auth/jwt.strategy';
import { DevicesService } from '../services/devices.service';
import { RegisterDeviceDto } from '../dto/register-device.dto';
import { RegisterDeviceResponseDto } from '../dto/register-device-response.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ScanAppsDto } from '../dto/scan-apps.dto';
import { ScanResponseDto } from '../dto/scan-response.dto';
import { DeviceStatusResponseDto } from '../dto/device-status-response.dto';

@ApiTags('devices')
@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Post('register')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a device' })
  @ApiBody({ type: RegisterDeviceDto })
  @ApiResponse({
    status: 201,
    description: 'Device registered',
    type: RegisterDeviceResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async register(
    @Body() body: RegisterDeviceDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    const userId = req.user.userId;
    const result = await this.devicesService.register(body, userId);
    return {
      device: result.device,
      isRegistered: result.isRegistered,
      message: result.isRegistered
        ? 'Device already registered'
        : 'Device registered successfully',
    };
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user device registration status' })
  @ApiResponse({
    status: 200,
    description: 'Device registration status',
    type: DeviceStatusResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getDeviceStatus(@Req() req: Request & { user: JwtPayload }) {
    const userId = req.user.userId;
    const status = await this.devicesService.getDeviceStatus(userId);
    return status;
  }

  @Post(':id/scan')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload a device scan (installed apps)' })
  @ApiBody({ type: ScanAppsDto })
  @ApiResponse({ status: 201, type: ScanResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async uploadScan(
    @Param('id') id: string,
    @Body() body: ScanAppsDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    const userId = req.user.userId;
    const result = await this.devicesService.createScan(id, userId, body.apps);
    return {
      scanId: result.scan._id,
      threatsFound: result.threatsFound,
      riskScore: result.riskScore,
    };
  }
}
