import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, HydratedDocument, Types } from 'mongoose';

export type DeviceDocument = HydratedDocument<Device>;

@Schema({ timestamps: true })
export class Device extends Document {
  @Prop({ required: true, unique: true, index: true })
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
