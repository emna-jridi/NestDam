import {
  Controller,
  Post,
  Body,
  Req,
  Get,
  Patch,
  Param,
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

  @UseGuards(JwtAuthGuard)
  @Patch(':id/read')
  async markAsRead(@Req() req: any, @Param('id') alertId: string) {
    return this.alertsService.markAlertAsRead(alertId, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('read-all')
  async markAllAsRead(@Req() req: any) {
    return this.alertsService.markAllAlertsAsRead(req.user.userId);
  }
}
