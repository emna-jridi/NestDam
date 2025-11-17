import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Device } from '../schemas/device.schema';
import { RegisterDeviceDto } from '../dto/register-device.dto';
import { DeviceScan } from '../schemas/device-scan.schema';
import { User } from '../../user-management/entities/user.entity';

@Injectable()
export class DevicesService {
  private readonly logger = new Logger(DevicesService.name);
  constructor(
    @InjectModel(Device.name) private deviceModel: Model<Device>,
    @InjectModel(DeviceScan.name) private deviceScanModel: Model<DeviceScan>,
    @InjectModel(User.name) private userModel: Model<User>,
  ) {}

  async register(
    dto: RegisterDeviceDto,
    userId?: string,
  ): Promise<{ device: Device; isRegistered: boolean }> {
    if (!userId) {
      // require authenticated user for device registration to satisfy schema
      throw new ForbiddenException(
        'Authenticated user required to register device',
      );
    }

    // Log the registration attempt for debugging
    this.logger.log(
      `Registration attempt - deviceIdentifier: ${dto.deviceIdentifier}, platform: ${dto.platform}, userId: ${userId}`,
    );

    // Check if device is already registered for this user and platform
    // A device is uniquely identified by deviceIdentifier + platform + userId
    const existingDevice = await this.deviceModel.findOne({
      deviceIdentifier: dto.deviceIdentifier,
      platform: dto.platform,
      userId: new Types.ObjectId(userId),
    });

    if (existingDevice) {
      this.logger.log(
        `Found existing device: _id=${String(existingDevice._id)}, platform=${existingDevice.platform}, deviceIdentifier=${existingDevice.deviceIdentifier}`,
      );
    } else {
      this.logger.log('No existing device found, creating new device');
    }

    if (existingDevice) {
      // Update last seen and device info
      existingDevice.lastSeen = new Date();
      if (dto.osVersion) existingDevice.osVersion = dto.osVersion;
      if (dto.deviceModel) existingDevice.deviceModel = dto.deviceModel;
      if (dto.appVersion) existingDevice.appVersion = dto.appVersion;
      const updated = await existingDevice.save();

      // ensure user's devices array contains this device
      await this.userModel.findByIdAndUpdate(userId, {
        $addToSet: { devices: updated._id },
        $set: { isDeviceRegistered: true },
      });

      this.logger.log(
        `Device ${updated.deviceIdentifier} already registered, updated`,
      );
      return { device: updated, isRegistered: true };
    }

    // Create new device
    try {
      const created = new this.deviceModel({
        deviceIdentifier: dto.deviceIdentifier,
        platform: dto.platform,
        osVersion: dto.osVersion,
        deviceModel: dto.deviceModel,
        appVersion: dto.appVersion,
        userId: new Types.ObjectId(userId),
        lastSeen: new Date(),
      });
      const saved = await created.save();
      this.logger.log(
        `Registered new device ${saved.deviceIdentifier} (${saved.platform})`,
      );

      // ensure user's devices array contains this device
      await this.userModel.findByIdAndUpdate(userId, {
        $addToSet: { devices: saved._id },
        $set: { isDeviceRegistered: true },
      });

      return { device: saved, isRegistered: false };
    } catch (error: unknown) {
      // Handle duplicate key error (E11000) - might be from old schema index
      const err = error as { code?: number; message?: string };
      if (err.code === 11000) {
        this.logger.error(
          `Duplicate key error during device registration: ${err.message || String(error)}`,
        );
        this.logger.warn(
          'This may be due to an old database index. Run the migration script: npx ts-node scripts/fix-device-indexes.ts',
        );
        // Try to find the device again in case it was created between checks
        // Check for deviceIdentifier + platform + userId combination
        const device = await this.deviceModel.findOne({
          deviceIdentifier: dto.deviceIdentifier,
          platform: dto.platform,
          userId: new Types.ObjectId(userId),
        });
        if (device) {
          device.lastSeen = new Date();
          if (dto.osVersion) device.osVersion = dto.osVersion;
          if (dto.deviceModel) device.deviceModel = dto.deviceModel;
          if (dto.appVersion) device.appVersion = dto.appVersion;
          const updated = await device.save();
          await this.userModel.findByIdAndUpdate(userId, {
            $addToSet: { devices: updated._id },
            $set: { isDeviceRegistered: true },
          });
          this.logger.log(
            `Device ${updated.deviceIdentifier} found after duplicate key error, returning existing device`,
          );
          return { device: updated, isRegistered: true };
        }
        // If device not found, it might be a constraint on a different field
        // Check if it's the old user.email index issue
        if (err.message?.includes('user.email')) {
          this.logger.error(
            'Old database index detected on user.email. Please run migration script.',
          );
          throw new BadRequestException(
            'Database configuration issue detected. Please contact support. Error: Old index constraint on user.email field.',
          );
        }
        throw new BadRequestException(
          'Device registration failed due to database constraint. Please contact support if this persists.',
        );
      }
      throw error;
    }
  }

  async createScan(
    deviceIdOrIdentifier: string,
    userId: string,
    apps: Array<{
      packageName: string;
      versionCode?: number;
      versionName?: string;
    }>,
  ) {
    // Try to find device by MongoDB ObjectId first (if it's a valid ObjectId)
    // Otherwise, find by deviceIdentifier
    let device: Device | null = null;

    // Check if the string is a valid MongoDB ObjectId (24 hex characters)
    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(deviceIdOrIdentifier);

    if (isValidObjectId) {
      // Try finding by MongoDB _id first
      try {
        device = await this.deviceModel.findById(deviceIdOrIdentifier);
      } catch {
        // If ObjectId is invalid, continue to try deviceIdentifier
        this.logger.warn(
          `Invalid ObjectId format: ${deviceIdOrIdentifier}, trying deviceIdentifier`,
        );
      }
    }

    // If not found by _id, try finding by deviceIdentifier
    if (!device) {
      device = await this.deviceModel.findOne({
        deviceIdentifier: deviceIdOrIdentifier,
      });
    }

    if (!device) {
      throw new NotFoundException(
        `Device with identifier ${deviceIdOrIdentifier} not found. Please register the device first.`,
      );
    }
    const ownerId = device.userId?.toString();
    if (!ownerId || ownerId !== userId) {
      throw new ForbiddenException(
        'You are not allowed to upload scans for this device',
      );
    }

    // simple heuristic scoring
    let threatsFound = 0;
    const scoredApps = apps.map((a) => {
      const issues: string[] = [];
      const name = (a.packageName || '').toLowerCase();
      if (
        name.includes('tracker') ||
        name.includes('analytics') ||
        name.includes('admob') ||
        name.includes('ads')
      ) {
        issues.push('known-tracker');
      }
      const riskLevel = issues.length > 0 ? 'high' : 'low';
      if (issues.length > 0) threatsFound++;
      return { ...a, riskLevel, issues };
    });

    const riskScore = Math.min(
      100,
      Math.round((threatsFound / Math.max(1, apps.length)) * 100),
    );

    const scan = await this.deviceScanModel.create({
      deviceId: device._id,
      apps: scoredApps,
      riskScore,
      scannedAt: new Date(),
      uploadedBy: new Types.ObjectId(userId),
    });

    await this.deviceModel.findByIdAndUpdate(device._id, {
      lastScanAt: new Date(),
      lastRiskScore: riskScore,
      lastSeen: new Date(),
    });

    // ensure user's devices array contains this device
    await this.userModel.findByIdAndUpdate(userId, {
      $addToSet: { devices: device._id },
    });

    return { scan, threatsFound, riskScore };
  }

  async getDeviceStatus(userId: string) {
    const user = await this.userModel.findById(userId).populate('devices');
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const devices = await this.deviceModel.find({
      userId: new Types.ObjectId(userId),
    });

    return {
      isDeviceRegistered: user.isDeviceRegistered || false,
      deviceCount: devices.length,
      devices: devices.map((device) => ({
        _id: device._id,
        deviceIdentifier: device.deviceIdentifier,
        platform: device.platform,
        osVersion: device.osVersion,
        deviceModel: device.deviceModel,
        appVersion: device.appVersion,
        lastSeen: device.lastSeen,
        lastScanAt: device.lastScanAt,
        lastRiskScore: device.lastRiskScore,
      })),
    };
  }

  async getDeviceByIdentifier(
    deviceIdentifier: string,
    userId: string,
  ): Promise<Device> {
    const device = await this.deviceModel.findOne({
      deviceIdentifier: deviceIdentifier,
      userId: new Types.ObjectId(userId),
    });

    if (!device) {
      throw new NotFoundException(
        `Device with identifier ${deviceIdentifier} not found for this user`,
      );
    }

    return device;
  }

  async checkDeviceRegistration(
    deviceIdentifier: string,
    platform: string,
    userId: string,
  ): Promise<{ isRegistered: boolean; device?: Device }> {
    // Check if device with this identifier and platform exists for this user
    const device = await this.deviceModel.findOne({
      deviceIdentifier: deviceIdentifier,
      platform: platform,
      userId: new Types.ObjectId(userId),
    });

    if (device) {
      return { isRegistered: true, device };
    }

    return { isRegistered: false };
  }
}
