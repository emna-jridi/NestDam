import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type VaultDocument = Vault & Document;

@Schema({ timestamps: true })
export class Vault {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  masterPasswordHash: string; // Argon2id hash of the client's auth hash (v2) or legacy master password (v1)

  @Prop({ required: true })
  salt: string; // Salt for key derivation (client-side)

  // 1 = server received the raw master password (legacy), 2 = server only sees a one-way auth hash.
  // v1 vaults upgrade to v2 on their next successful unlock.
  @Prop({ default: 1 })
  authVersion: number;

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
