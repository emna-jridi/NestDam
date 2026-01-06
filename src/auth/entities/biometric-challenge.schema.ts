import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, HydratedDocument, Types } from 'mongoose';

export type BiometricChallengeDocument = HydratedDocument<BiometricChallenge>;

/**
 * Schema for storing temporary authentication challenges
 * Challenges are short-lived and single-use (anti-replay protection)
 */
@Schema({ timestamps: true })
export class BiometricChallenge {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, index: true })
  deviceId: string;

  @Prop({ required: true, unique: true })
  challenge: string; // Random 32-byte hex string

  @Prop({ required: true })
  expiresAt: Date; // Challenge validity (typically 2-5 minutes)

  @Prop({ default: false })
  isUsed: boolean; // Marked true after successful verification

  @Prop({ default: null })
  usedAt: Date; // When the challenge was consumed

  @Prop({ default: null })
  ipAddress: string; // IP that requested the challenge (security audit)

  @Prop({ default: null })
  userAgent: string; // User agent (security audit)
}

export const BiometricChallengeSchema = SchemaFactory.createForClass(BiometricChallenge);

// Auto-expire challenges after 5 minutes (TTL index)
BiometricChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Index for quick lookups
BiometricChallengeSchema.index({ challenge: 1, deviceId: 1 });
