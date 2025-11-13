import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type DeviceScanDocument = DeviceScan & Document;

@Schema({ timestamps: true })
export class DeviceScan extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Device', required: true })
  deviceId: Types.ObjectId;

  @Prop({ type: [], default: [] })
  apps: Array<{
    packageName: string;
    versionCode?: number;
    versionName?: string;
    riskLevel?: string;
    issues?: string[];
  }>;

  @Prop()
  riskScore: number;

  @Prop()
  scannedAt: Date;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  uploadedBy: Types.ObjectId;
}

export const DeviceScanSchema = SchemaFactory.createForClass(DeviceScan);
