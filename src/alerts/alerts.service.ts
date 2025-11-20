import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Alert, AlertDocument } from './alert.schema';
import { DeviceToken, DeviceTokenDocument } from './device-token.schema';
import * as admin from 'firebase-admin';

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    @InjectModel(Alert.name) private alertModel: Model<AlertDocument>,
    @InjectModel(DeviceToken.name) private tokenModel: Model<DeviceTokenDocument>,
  ) {
    if (!admin.apps.length) {
      const svc = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      if (!svc) {
        this.logger.warn('No Firebase credentials found');
      } else {
        admin.initializeApp({
          credential: admin.credential.cert(JSON.parse(svc)),
        });
      }
    }
  }

  computeSeverity(event: string, details?: any) {
    const e = event.toLowerCase();

    if (e.includes('microphone') && e.includes('background')) return 'critical';
    if (e.includes('camera') && e.includes('background')) return 'critical';
    if (e.includes('excessive')) return 'high';
    if (e.includes('suspicious')) return 'high';
    if (e.includes('location') && details?.frequency > 10) return 'high';
    if (e.includes('location')) return 'medium';

    return 'info';
  }

  async saveAlert(userId: string, dto: any) {
    const severity = this.computeSeverity(dto.event, dto.details);
    return await this.alertModel.create({
      userId,
      packageName: dto.packageName,
      event: dto.event,
      timestamp: dto.timestamp,
      details: dto.details,
      notified: false,
      severity,
    });
  }

async sendPushToUser(userId: string, alert: AlertDocument) {
  const tokens = await this.tokenModel.find({ userId }).lean();
  const fcmTokens = tokens.map((t) => t.token);

  if (!fcmTokens.length) {
    this.logger.log(`No device tokens for user ${userId}`);
    return;
  }

  const message = {
    notification: {
      title: alert.severity === 'critical'
        ? '⚠️ Critical Security Alert'
        : 'Security Alert',
      body: `${alert.packageName} — ${alert.event}`,
    },
    data: {
      severity: alert.severity,
      alertId: alert._id.toString(),
    },
    tokens: fcmTokens,
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(message);

    this.logger.log(
      `Push results: ${response.successCount} success, ${response.failureCount} failed`
    );

    await this.alertModel.updateOne(
      { _id: alert._id },
      { $set: { notified: true } }
    );
  } catch (e) {
    this.logger.error('Push error:', e);
  }
}


  async createAndDispatch(userId: string, dto: any) {
    const alert = await this.saveAlert(userId, dto);
    await this.sendPushToUser(userId, alert);
    return alert;
  }

  async registerDeviceToken(userId: string, token: string, platform: string) {
    return this.tokenModel.updateOne(
      { token },
      { userId, platform },
      { upsert: true },
    );
  }

  async getUserAlerts(userId: string) {
    return this.alertModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .lean();
  }
  // alerts.service.ts
async getTokens(userId: string) {
  return this.tokenModel.find({ userId }).lean();
}
}
