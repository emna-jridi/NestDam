import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type VaultDocument = Vault & Document;

@Schema({ timestamps: true })
export class Vault {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  masterPasswordHash: string; // Argon2id hash - NEVER plaintext

  @Prop({ required: true })
  salt: string; // Salt for key derivation (client-side)

  @Prop({ default: 0 })
  failedUnlockAttempts: number;

  @Prop({ type: Date, default: null })
  lockedUntil: Date | null;

  @Prop({ default: false })
  paranoidMode: boolean; // Wipe after 10 failures

  @Prop({ default: 300000 }) // 5 minutes in ms
  autoLockTimeout: number;

  @Prop({ type: Date })
  lastUnlockedAt: Date;

  @Prop({ default: false })
  twoFactorEnabled: boolean;

  @Prop({ type: String, default: null })
  twoFactorSecret: string | null;

  @Prop({ type: Date })
  createdAt: Date;

  @Prop({ type: Date })
  updatedAt: Date;
}

export const VaultSchema = SchemaFactory.createForClass(Vault);

// Indexes for performance
VaultSchema.index({ userId: 1 }, { unique: true });
VaultSchema.index({ lockedUntil: 1 });
