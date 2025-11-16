import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, HydratedDocument, Types } from 'mongoose';

export type DeviceDocument = HydratedDocument<Device>;

@Schema({ timestamps: true })
export class Device extends Document {
  @Prop({ required: true, index: true })
  deviceIdentifier: string;

  @Prop({ required: true })
  platform: string;

  @Prop()
  osVersion?: string;

  @Prop()
  deviceModel?: string;

  @Prop()
  appVersion?: string;

  @Prop({ type: Date })
  lastSeen?: Date;

  @Prop({ type: Date })
  lastScanAt?: Date;

  @Prop()
  lastRiskScore?: number;

  @Prop()
  pushToken?: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;
}

export const DeviceSchema = SchemaFactory.createForClass(Device);

// Create compound unique index: deviceIdentifier + platform + userId
// This allows the same deviceIdentifier on different platforms for the same user
DeviceSchema.index(
  { deviceIdentifier: 1, platform: 1, userId: 1 },
  { unique: true, name: 'deviceIdentifier_platform_userId_unique' },
);
