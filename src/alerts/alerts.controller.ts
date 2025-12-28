import {
  Controller,
  Post,
  Body,
  Req,
  Get,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { CreateAlertDto } from './dto/create-alert.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UseGuards } from '@nestjs/common';

@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  // Protected routes — require JWT
  @UseGuards(JwtAuthGuard)
  @Post('event')
  async createAlert(@Req() req: any, @Body() dto: CreateAlertDto) {
    const userId = req.user.userId;
    return this.alertsService.createAndDispatch(userId, dto);
  }

  @UseGuards(JwtAuthGuard)
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
  @Get()
  async getMyAlerts(@Req() req: any) {
    return this.alertsService.getUserAlerts(req.user.userId);
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
