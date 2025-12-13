import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'scans' })
export class ScanSchema extends Document {
  declare _id: Types.ObjectId;

  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  deviceId: string;

  @Prop({ type: String, enum: ['android', 'ios'], required: true, default: 'android' })
  platform: 'android' | 'ios';

  @Prop({
    type: String,
    enum: ['pending', 'analyzing', 'completed', 'failed'],
    default: 'pending',
  })
  status: 'pending' | 'analyzing' | 'completed' | 'failed';

  @Prop({ type: Number, default: 0 })
  totalApps: number;

  @Prop({ type: Number, default: 0 })
  scannedApps: number;

  @Prop({ type: Object, default: null })
  results?: Record<string, any>;

  @Prop({ type: Date })
  completedAt?: Date;

  @Prop({ type: Number })
  duration?: number;

  @Prop({ type: String })
  errorMessage?: string;

  @Prop({ type: String })
  errorStack?: string;

  @Prop({ type: Date })
  createdAt: Date;

  @Prop({ type: Date })
  updatedAt: Date;
}

export const ScanSchemaFactory = SchemaFactory.createForClass(ScanSchema);
