import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, HydratedDocument, Types } from 'mongoose';

export type BiometricDeviceDocument = HydratedDocument<BiometricDevice>;

/**
 * Schema for storing biometric-enabled devices
 * Each device has its own asymmetric key pair (RSA/EC)
 * The private key stays on the device, public key is stored here
 */
@Schema({ timestamps: true })
export class BiometricDevice {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, index: true })
  deviceId: string; // Unique device identifier (UUID generated on device)

  @Prop({ required: true })
  publicKey: string; // PEM-encoded public key (RSA or EC)

  @Prop({ required: true, enum: ['RSA', 'EC'] })
  keyType: string; // Algorithm type: RSA-2048 or EC P-256

  @Prop({ required: true })
  deviceName: string; // Human-readable name (e.g., "Samsung Galaxy S24")

  @Prop({ default: 'unknown' })
  platform: string; // 'android' | 'ios' | 'unknown'

  @Prop({ default: null, type: String })
  osVersion?: string; // e.g., "Android 14" or "iOS 17.2"

  @Prop({ default: null, type: String })
  appVersion?: string; // App version when registered

  @Prop({ default: true })
  isActive: boolean; // Can be disabled without deletion

  @Prop({ default: null, type: Date })
  lastUsedAt?: Date; // Last successful biometric auth

  @Prop({ default: 0 })
  authCount: number; // Number of successful authentications

  @Prop({ default: 0 })
  failedAttempts: number; // Failed verification attempts (security monitoring)

  @Prop({ default: null, type: Date })
  revokedAt?: Date; // If device was revoked

  @Prop({ default: null, type: String })
  revokedReason?: string; // Reason for revocation

  // Timestamps added by @Schema({ timestamps: true })
  createdAt?: Date;
  updatedAt?: Date;
}

export const BiometricDeviceSchema = SchemaFactory.createForClass(BiometricDevice);

// Compound index for efficient lookups
BiometricDeviceSchema.index({ userId: 1, deviceId: 1 }, { unique: true });
BiometricDeviceSchema.index({ userId: 1, isActive: 1 });
