import { Schema, SchemaFactory, Prop } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, expireAfterSeconds: 86400 }) // 24 hours
export class ScanProgress extends Document {
  @Prop({ required: true, unique: true, index: true })
  scanId: string;

  @Prop({ required: true })
  packageName: string;

  @Prop({ type: Number, default: 0 })
  percentage: number;

  @Prop({ required: true })
  currentStep: string;

  @Prop({
    type: [
      {
        name: String,
        status: String,
        progress: Number,
        startTime: Date,
        endTime: Date,
        duration: Number,
      },
    ],
  })
  steps: Array<{
    name: string;
    status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
    progress: number;
    startTime?: Date;
    endTime?: Date;
    duration?: number;
  }>;

  @Prop()
  estimatedTimeRemaining: number;

  @Prop({ default: () => new Date() })
  startTime: Date;

  @Prop()
  lastUpdated: Date;
}

export const ScanProgressSchema = SchemaFactory.createForClass(ScanProgress);
ScanProgressSchema.index({ scanId: 1 });
