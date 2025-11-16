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
  Query,
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
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ScanAppsDto } from '../dto/scan-apps.dto';
import { ScanResponseDto } from '../dto/scan-response.dto';
import { DeviceStatusResponseDto } from '../dto/device-status-response.dto';
import { DeviceResponseDto } from '../dto/device-response.dto';

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
    // Log incoming request for debugging
    console.log('Device registration request:', {
      deviceIdentifier: body.deviceIdentifier,
      platform: body.platform,
      userId: userId,
    });
    const result = await this.devicesService.register(body, userId);
    return {
      device: result.device,
      isRegistered: result.isRegistered,
      message: result.isRegistered
        ? 'Device already registered'
        : 'Device registered successfully',
    };
  }

  @Get('check')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Check if current device is registered',
    description:
      'Checks if the device with the given identifier and platform is registered for the authenticated user. Use this to determine if device needs registration.',
  })
  @ApiResponse({
    status: 200,
    description: 'Device registration status checked',
    schema: {
      type: 'object',
      properties: {
        isRegistered: {
          type: 'boolean',
          example: true,
          description: 'Whether the device is registered',
        },
        device: {
          type: 'object',
          description: 'Device information if registered',
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async checkDeviceRegistration(
    @Query('deviceIdentifier') deviceIdentifier: string,
    @Query('platform') platform: string,
    @Req() req: Request & { user: JwtPayload },
  ) {
    const userId = req.user.userId;
    const result = await this.devicesService.checkDeviceRegistration(
      deviceIdentifier,
      platform,
      userId,
    );
    return result;
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

  @Get('identifier/:deviceIdentifier')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get device by deviceIdentifier',
    description:
      'Fetches a device using its deviceIdentifier. Returns the device for the authenticated user.',
  })
  @ApiParam({
    name: 'deviceIdentifier',
    description:
      'Device identifier (e.g., Android ID, iOS identifierForVendor)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Device found',
    type: DeviceResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Device not found' })
  async getDeviceByIdentifier(
    @Param('deviceIdentifier') deviceIdentifier: string,
    @Req() req: Request & { user: JwtPayload },
  ) {
    const userId = req.user.userId;
    const device = await this.devicesService.getDeviceByIdentifier(
      deviceIdentifier,
      userId,
    );
    return device;
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
