import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Alert, AlertDocument } from './alert.schema';
import { DeviceToken, DeviceTokenDocument } from './device-token.schema';
import { Device, DeviceDocument } from '../devices/schemas/device.schema';
import * as admin from 'firebase-admin';

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    @InjectModel(Alert.name) private alertModel: Model<AlertDocument>,
    @InjectModel(DeviceToken.name)
    private tokenModel: Model<DeviceTokenDocument>,
    @InjectModel(Device.name) private deviceModel: Model<DeviceDocument>,
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

  computeSeverity(
    event: string,
    details?: Record<string, any>,
  ): 'critical' | 'high' | 'medium' | 'info' {
    const e = event.toLowerCase();

    if (e.includes('microphone') && e.includes('background')) return 'critical';
    if (e.includes('camera') && e.includes('background')) return 'critical';
    if (e.includes('excessive')) return 'high';
    if (e.includes('suspicious')) return 'high';
    if (e.includes('location') && details?.frequency > 10) return 'high';
    if (e.includes('location')) return 'medium';

    return 'info';
  }

  async saveAlert(
    userId: string,
    dto: {
      packageName: string;
      event: string;
      timestamp: number;
      deviceId?: string;
      details?: Record<string, any>;
    },
  ) {
    const severity = this.computeSeverity(dto.event, dto.details);

    // Validate deviceId if provided
    let deviceId: Types.ObjectId | undefined;
    if (dto.deviceId) {
      const device = await this.deviceModel.findOne({
        _id: new Types.ObjectId(dto.deviceId),
        userId: new Types.ObjectId(userId),
      });

      if (!device) {
        throw new NotFoundException(
          `Device with ID ${dto.deviceId} not found for this user`,
        );
      }

      deviceId = device._id as Types.ObjectId;
    }

    return await this.alertModel.create({
      userId,
      deviceId,
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
        title:
          alert.severity === 'critical'
            ? '⚠️ Critical Security Alert'
            : 'Security Alert',
        body: `${alert.packageName} — ${alert.event}`,
      },
      data: {
        severity: alert.severity,
        alertId: String(alert._id),
      },
      tokens: fcmTokens,
    };

    try {
      const response = await admin.messaging().sendEachForMulticast(message);

      this.logger.log(
        `Push results: ${response.successCount} success, ${response.failureCount} failed`,
      );

      await this.alertModel.updateOne(
        { _id: alert._id },
        { $set: { notified: true } },
      );
    } catch (e) {
      this.logger.error('Push error:', e);
    }
  }

  async createAndDispatch(
    userId: string,
    dto: {
      packageName: string;
      event: string;
      timestamp: number;
      deviceId?: string;
      details?: Record<string, any>;
    },
  ) {
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

  async getUserAlerts(userId: string, deviceId?: string) {
    const query: { userId: string; deviceId?: Types.ObjectId } = { userId };

    if (deviceId) {
      query.deviceId = new Types.ObjectId(deviceId);
    }

    return this.alertModel
      .find(query)
      .populate('deviceId', 'deviceIdentifier platform deviceModel osVersion')
      .sort({ createdAt: -1 })
      .lean();
  }

  async getDeviceAlerts(userId: string, deviceId: string) {
    // Verify device belongs to user
    const device = await this.deviceModel.findOne({
      _id: new Types.ObjectId(deviceId),
      userId: new Types.ObjectId(userId),
    });

    if (!device) {
      throw new NotFoundException(
        `Device with ID ${deviceId} not found for this user`,
      );
    }

    return this.alertModel
      .find({
        userId,
        deviceId: new Types.ObjectId(deviceId),
      })
      .sort({ createdAt: -1 })
      .lean();
  }

  async getUserDevicesWithAlerts(userId: string) {
    // Get all devices for user
    const devices = await this.deviceModel
      .find({ userId: new Types.ObjectId(userId) })
      .lean();

    // Get alerts for each device
    const devicesWithAlerts = await Promise.all(
      devices.map(async (device) => {
        const alerts = await this.alertModel
          .find({
            userId,
            deviceId: device._id,
          })
          .sort({ createdAt: -1 })
          .lean();

        const criticalAlerts = alerts.filter(
          (a) => a.severity === 'critical',
        ).length;
        const highAlerts = alerts.filter((a) => a.severity === 'high').length;

        const deviceId =
          device._id instanceof Types.ObjectId
            ? device._id.toString()
            : String(device._id);

        return {
          id: deviceId,
          deviceIdentifier: device.deviceIdentifier,
          platform: device.platform,
          osVersion: device.osVersion,
          deviceModel: device.deviceModel,
          appVersion: device.appVersion,
          lastSeen: device.lastSeen,
          alertCount: alerts.length,
          criticalAlerts,
          highAlerts,
          alerts: alerts.map((alert) => {
            const alertId =
              alert._id instanceof Types.ObjectId
                ? alert._id.toString()
                : String(alert._id);
            return {
              id: alertId,
              packageName: alert.packageName,
              event: alert.event,
              severity: alert.severity,
              timestamp: alert.timestamp,
              createdAt:
                (alert as { createdAt?: Date }).createdAt || new Date(),
              notified: alert.notified,
              details: alert.details,
            };
          }),
        };
      }),
    );

    const totalAlerts = devicesWithAlerts.reduce(
      (sum, device) => sum + device.alertCount,
      0,
    );

    return {
      totalDevices: devicesWithAlerts.length,
      totalAlerts,
      devices: devicesWithAlerts,
    };
  }

  async getTokens(userId: string) {
    return this.tokenModel.find({ userId }).lean();
  }
}
