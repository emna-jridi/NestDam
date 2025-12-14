import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type VaultBackupDocument = VaultBackup & Document;

@Schema({ timestamps: true })
export class VaultBackup {
  @Prop({ type: Types.ObjectId, ref: 'Vault', required: true })
  vaultId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  encryptedBackupData: string; // JSON string of all passwords, encrypted

  @Prop({ required: true })
  backupHash: string; // SHA-256 hash for integrity verification

  @Prop({ default: 'manual' })
  backupType: string; // 'manual' | 'automatic'

  @Prop({ type: Number })
  entryCount: number;

  @Prop({ type: Date })
  createdAt: Date;
}

export const VaultBackupSchema = SchemaFactory.createForClass(VaultBackup);

VaultBackupSchema.index({ vaultId: 1, createdAt: -1 });
VaultBackupSchema.index({ userId: 1, createdAt: -1 });
