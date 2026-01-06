import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { BiometricDevice, BiometricDeviceDocument } from './entities/biometric-device.schema';
import { BiometricChallenge, BiometricChallengeDocument } from './entities/biometric-challenge.schema';
import { User, UserDocument } from '../users/entities/user.entity';
import {
  RegisterBiometricDeviceDto,
  RequestChallengeDto,
  VerifyBiometricDto,
} from './dto/biometric.dto';

@Injectable()
export class BiometricService {
  private readonly logger = new Logger(BiometricService.name);

  // Challenge validity duration (in minutes)
  private readonly CHALLENGE_VALIDITY_MINUTES = 5;
  
  // Maximum devices per user
  private readonly MAX_DEVICES_PER_USER = 5;

  // Maximum failed attempts before device is locked
  private readonly MAX_FAILED_ATTEMPTS = 5;

  constructor(
    @InjectModel(BiometricDevice.name)
    private biometricDeviceModel: Model<BiometricDeviceDocument>,
    @InjectModel(BiometricChallenge.name)
    private biometricChallengeModel: Model<BiometricChallengeDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
    private jwtService: JwtService,
  ) {}

  // ================================================
  // REGISTER DEVICE
  // ================================================
  async registerDevice(
    userId: string,
    dto: RegisterBiometricDeviceDto,
  ): Promise<{ success: boolean; deviceId: string; message: string }> {
    this.logger.log(`[REGISTER] User ${userId} registering device: ${dto.deviceName}`);

    // Validate public key format
    if (!this.isValidPublicKey(dto.publicKey, dto.keyType)) {
      throw new BadRequestException('Invalid public key format');
    }

    // Check if device already exists for this user
    const existingDevice = await this.biometricDeviceModel.findOne({
      userId: new Types.ObjectId(userId),
      deviceId: dto.deviceId,
    });

    if (existingDevice) {
      // Update existing device (re-registration)
      existingDevice.publicKey = dto.publicKey;
      existingDevice.keyType = dto.keyType;
      existingDevice.deviceName = dto.deviceName;
      existingDevice.platform = dto.platform || 'unknown';
      existingDevice.osVersion = dto.osVersion || undefined;
      existingDevice.appVersion = dto.appVersion || undefined;
      existingDevice.isActive = true;
      existingDevice.failedAttempts = 0;
      existingDevice.revokedAt = undefined;
      existingDevice.revokedReason = undefined;
      await existingDevice.save();

      this.logger.log(`[REGISTER] Device ${dto.deviceId} re-registered for user ${userId}`);
      return {
        success: true,
        deviceId: dto.deviceId,
        message: 'Device re-registered successfully',
      };
    }

    // Check device limit
    const deviceCount = await this.biometricDeviceModel.countDocuments({
      userId: new Types.ObjectId(userId),
      isActive: true,
    });

    if (deviceCount >= this.MAX_DEVICES_PER_USER) {
      throw new BadRequestException(
        `Maximum number of devices (${this.MAX_DEVICES_PER_USER}) reached. Please remove a device first.`,
      );
    }

    // Create new device
    const newDevice = new this.biometricDeviceModel({
      userId: new Types.ObjectId(userId),
      deviceId: dto.deviceId,
      publicKey: dto.publicKey,
      keyType: dto.keyType,
      deviceName: dto.deviceName,
      platform: dto.platform || 'unknown',
      osVersion: dto.osVersion || null,
      appVersion: dto.appVersion || null,
      isActive: true,
    });

    await newDevice.save();

    this.logger.log(`[REGISTER] ✅ New device ${dto.deviceId} registered for user ${userId}`);
    return {
      success: true,
      deviceId: dto.deviceId,
      message: 'Device registered successfully',
    };
  }

  // ================================================
  // REQUEST CHALLENGE
  // ================================================
  async requestChallenge(
    deviceId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ challenge: string; expiresAt: Date; expiresIn: number }> {
    this.logger.log(`[CHALLENGE] Requesting challenge for device: ${deviceId}`);

    // Find the device
    const device = await this.biometricDeviceModel.findOne({
      deviceId,
      isActive: true,
    });

    if (!device) {
      throw new NotFoundException('Device not registered or inactive');
    }

    // Check if device is locked due to failed attempts
    if (device.failedAttempts >= this.MAX_FAILED_ATTEMPTS) {
      throw new UnauthorizedException(
        'Device locked due to too many failed attempts. Please re-authenticate with password.',
      );
    }

    // Generate cryptographically secure random challenge
    const challenge = crypto.randomBytes(32).toString('hex');
    
    // Calculate expiration
    const expiresAt = new Date(Date.now() + this.CHALLENGE_VALIDITY_MINUTES * 60 * 1000);

    // Delete any existing challenges for this device (only one active at a time)
    await this.biometricChallengeModel.deleteMany({ deviceId });

    // Create new challenge
    const newChallenge = new this.biometricChallengeModel({
      userId: device.userId,
      deviceId,
      challenge,
      expiresAt,
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
    });

    await newChallenge.save();

    this.logger.log(`[CHALLENGE] ✅ Challenge generated for device ${deviceId}, expires at ${expiresAt}`);
    return {
      challenge,
      expiresAt,
      expiresIn: this.CHALLENGE_VALIDITY_MINUTES * 60, // seconds
    };
  }

  // ================================================
  // VERIFY SIGNATURE & AUTHENTICATE
  // ================================================
  async verifyAndAuthenticate(
    dto: VerifyBiometricDto,
  ): Promise<{
    success: boolean;
    accessToken: string;
    refreshToken: string;
    user: any;
  }> {
    this.logger.log(`[VERIFY] Verifying biometric for device: ${dto.deviceId}`);

    // Find the device
    const device = await this.biometricDeviceModel.findOne({
      deviceId: dto.deviceId,
      isActive: true,
    });

    if (!device) {
      throw new NotFoundException('Device not registered or inactive');
    }

    // Check if device is locked
    if (device.failedAttempts >= this.MAX_FAILED_ATTEMPTS) {
      throw new UnauthorizedException(
        'Device locked due to too many failed attempts',
      );
    }

    // Find and validate the challenge
    const challengeDoc = await this.biometricChallengeModel.findOne({
      deviceId: dto.deviceId,
      challenge: dto.challenge,
      isUsed: false,
    });

    if (!challengeDoc) {
      await this.incrementFailedAttempts(device);
      throw new UnauthorizedException('Invalid or expired challenge');
    }

    // Check if challenge has expired
    if (new Date() > challengeDoc.expiresAt) {
      await this.biometricChallengeModel.deleteOne({ _id: challengeDoc._id });
      await this.incrementFailedAttempts(device);
      throw new UnauthorizedException('Challenge has expired');
    }

    // Verify the signature
    const isValid = this.verifySignature(
      dto.challenge,
      dto.signature,
      device.publicKey,
      device.keyType,
    );

    if (!isValid) {
      await this.incrementFailedAttempts(device);
      this.logger.warn(`[VERIFY] ❌ Invalid signature for device ${dto.deviceId}`);
      throw new UnauthorizedException('Invalid signature');
    }

    // Mark challenge as used
    challengeDoc.isUsed = true;
    challengeDoc.usedAt = new Date();
    await challengeDoc.save();

    // Update device stats
    device.lastUsedAt = new Date();
    device.authCount += 1;
    device.failedAttempts = 0; // Reset on success
    await device.save();

    // Get user and generate tokens
    const user = await this.userModel.findById(device.userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const tokens = await this.generateTokens(user);

    this.logger.log(`[VERIFY] ✅ Biometric auth successful for user ${user.email}`);

    return {
      success: true,
      ...tokens,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarFileName: user.avatarFileName,
        userHash: user.userHash,
        provider: user.provider,
        isVerified: user.isVerified,
      },
    };
  }

  // ================================================
  // GET USER DEVICES
  // ================================================
  async getUserDevices(userId: string): Promise<any[]> {
    const devices = await this.biometricDeviceModel.find({
      userId: new Types.ObjectId(userId),
    }).select('-publicKey'); // Don't expose public keys in list

    return devices.map((device) => ({
      id: device._id,
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      platform: device.platform,
      osVersion: device.osVersion,
      isActive: device.isActive,
      lastUsedAt: device.lastUsedAt,
      authCount: device.authCount,
      createdAt: device.createdAt,
      revokedAt: device.revokedAt,
    }));
  }

  // ================================================
  // REVOKE DEVICE
  // ================================================
  async revokeDevice(
    userId: string,
    deviceId: string,
    reason?: string,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.log(`[REVOKE] User ${userId} revoking device: ${deviceId}`);

    const device = await this.biometricDeviceModel.findOne({
      userId: new Types.ObjectId(userId),
      deviceId,
    });

    if (!device) {
      throw new NotFoundException('Device not found');
    }

    device.isActive = false;
    device.revokedAt = new Date();
    device.revokedReason = reason || 'User requested revocation';
    await device.save();

    // Delete any pending challenges for this device
    await this.biometricChallengeModel.deleteMany({ deviceId });

    this.logger.log(`[REVOKE] ✅ Device ${deviceId} revoked successfully`);
    return {
      success: true,
      message: 'Device revoked successfully',
    };
  }

  // ================================================
  // DELETE DEVICE (permanent)
  // ================================================
  async deleteDevice(
    userId: string,
    deviceId: string,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.log(`[DELETE] User ${userId} deleting device: ${deviceId}`);

    const result = await this.biometricDeviceModel.deleteOne({
      userId: new Types.ObjectId(userId),
      deviceId,
    });

    if (result.deletedCount === 0) {
      throw new NotFoundException('Device not found');
    }

    // Delete any pending challenges
    await this.biometricChallengeModel.deleteMany({ deviceId });

    this.logger.log(`[DELETE] ✅ Device ${deviceId} deleted permanently`);
    return {
      success: true,
      message: 'Device deleted successfully',
    };
  }

  // ================================================
  // CHECK IF USER HAS BIOMETRIC ENABLED
  // ================================================
  async hasBiometricEnabled(userId: string): Promise<boolean> {
    const count = await this.biometricDeviceModel.countDocuments({
      userId: new Types.ObjectId(userId),
      isActive: true,
    });
    return count > 0;
  }

  // ================================================
  // PRIVATE HELPER METHODS
  // ================================================

  private isValidPublicKey(publicKey: string, keyType: string): boolean {
    try {
      // Try to create a key object from the PEM string
      const keyObject = crypto.createPublicKey(publicKey);
      
      // Verify key type matches
      const keyDetails = keyObject.asymmetricKeyDetails;
      
      if (keyType === 'RSA') {
        return keyObject.asymmetricKeyType === 'rsa';
      } else if (keyType === 'EC') {
        return keyObject.asymmetricKeyType === 'ec';
      }
      
      return false;
    } catch (error) {
      this.logger.error(`[VALIDATE] Invalid public key: ${error.message}`);
      return false;
    }
  }

  private verifySignature(
    challenge: string,
    signatureBase64: string,
    publicKeyPem: string,
    keyType: string,
  ): boolean {
    try {
      const publicKey = crypto.createPublicKey(publicKeyPem);
      const signature = Buffer.from(signatureBase64, 'base64');

      // Create verifier based on key type
      let algorithm: string;
      if (keyType === 'RSA') {
        algorithm = 'RSA-SHA256';
      } else if (keyType === 'EC') {
        algorithm = 'SHA256';
      } else {
        return false;
      }

      const verifier = crypto.createVerify(algorithm);
      verifier.update(challenge);
      verifier.end();

      return verifier.verify(publicKey, signature);
    } catch (error) {
      this.logger.error(`[VERIFY] Signature verification error: ${error.message}`);
      return false;
    }
  }

  private async incrementFailedAttempts(device: BiometricDeviceDocument): Promise<void> {
    device.failedAttempts += 1;
    await device.save();
    this.logger.warn(
      `[SECURITY] Device ${device.deviceId} failed attempts: ${device.failedAttempts}/${this.MAX_FAILED_ATTEMPTS}`,
    );
  }

  private async generateTokens(user: UserDocument): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const payload = {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: '24h',
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: 'your-refresh-secret-change-in-production',
      expiresIn: '7d',
    });

    return { accessToken, refreshToken };
  }
}
