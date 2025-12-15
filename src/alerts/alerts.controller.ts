import {
  Controller,
  Post,
  Body,
  Req,
  Get,
  Param,
  Query,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { CreateAlertDto } from './dto/create-alert.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import {
  DeviceWithAlertsDto,
  UserDevicesWithAlertsDto,
} from './dto/device-alert.dto';

@ApiTags('Alerts')
@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new alert' })
  @ApiResponse({ status: 201, description: 'Alert created successfully' })
  @Post('event')
  async createAlert(@Req() req: any, @Body() dto: CreateAlertDto) {
    const userId = req.user.userId;
    return this.alertsService.createAndDispatch(userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Register device token for push notifications' })
  @Post('device-token')
  async registerToken(
    @Req() req: any,
    @Body() body: { token: string; platform: string },
  ) {
    const userId = req.user.userId;
    return this.alertsService.registerDeviceToken(
      userId,
      body.token,
      body.platform,
    );
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user alerts, optionally filtered by device' })
  @ApiQuery({
    name: 'deviceId',
    required: false,
    description: 'Filter alerts by device ID',
  })
  @ApiResponse({ status: 200, description: 'List of alerts' })
  @Get()
  async getMyAlerts(@Req() req: any, @Query('deviceId') deviceId?: string) {
    return this.alertsService.getUserAlerts(req.user.userId, deviceId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get alerts for a specific device' })
  @ApiParam({ name: 'deviceId', description: 'Device ID' })
  @ApiResponse({
    status: 200,
    description: 'List of alerts for the device',
    type: [DeviceWithAlertsDto],
  })
  @ApiResponse({ status: 404, description: 'Device not found' })
  @Get('device/:deviceId')
  async getDeviceAlerts(@Req() req: any, @Param('deviceId') deviceId: string) {
    return this.alertsService.getDeviceAlerts(req.user.userId, deviceId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get all user devices with their associated alerts',
  })
  @ApiResponse({
    status: 200,
    description: 'Devices with alerts',
    type: UserDevicesWithAlertsDto,
  })
  @Get('devices')
  async getUserDevicesWithAlerts(@Req() req: any) {
    return this.alertsService.getUserDevicesWithAlerts(req.user.userId);
  }

  // PUBLIC TEST ROUTE — works without JWT
  @Get('test-push')
  async testPush() {
    const userId = '6910d82fe025eed333be3aaa';

    const testData = {
      packageName: 'com.instagram.android',
      event: 'TEST PUSH — IT WORKS 100%!!!',
      timestamp: Date.now(),
    };

    try {
      const alert = await this.alertsService.saveAlert(userId, testData);
      await this.alertsService.sendPushToUser(userId, alert);

      return {
        success: true,
        message: 'PUSH SENT — CHECK YOUR SIMULATOR RIGHT NOW!',
        alert,
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          error: error.message || 'Failed to send push',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  @UseGuards(JwtAuthGuard)
  @Get('whoami')
  async whoAmI(@Req() req: any) {
    console.log('JWT user payload:', req.user);
    return {
      message: 'Check your console!',
      userId: req.user.userId,
      email: req.user.email,
      role: req.user.role,
    };
  }
}
