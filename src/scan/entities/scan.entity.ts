import { Schema, SchemaFactory, Prop } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Scan extends Document {
  @Prop({ required: true, index: true })
  scanId: string;

  @Prop({ required: true, index: true })
  packageName: string;

  @Prop()
  appName: string;

  @Prop()
  versionCode: string;

  @Prop()
  versionName: string;

  @Prop({ enum: ['SMART', 'DEEP'], default: 'SMART' })
  level: string;

  @Prop({ enum: ['installed_app', 'apk_upload'], default: 'installed_app' })
  analysisType: string;

  @Prop({ enum: ['COMPLETED', 'FAILED', 'IN_PROGRESS', 'QUEUED'], default: 'QUEUED' })
  status: string;

  @Prop({ type: Number, default: 0 })
  securityScore: number;

  @Prop({ type: Number, default: 0 })
  privacyScore: number;

  @Prop({ enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'], default: 'LOW' })
  globalRisk: string;

  @Prop({ type: Number, default: 0 })
  overallScore: number;

  @Prop({ type: Number, default: 100 })
  confidenceScore: number;

  @Prop({ type: Boolean, default: false })
  recommendDeepAnalysis: boolean;

  @Prop({ type: Object })
  ml: Record<string, any>;

  @Prop({ type: Object })
  trackers: Record<string, any>;

  @Prop({ type: Object })
  saat: Record<string, any>;

  @Prop({ type: Object })
  cloudAnalysis: Record<string, any>;

  @Prop({ default: () => new Date() })
  startTime: Date;

  @Prop()
  endTime: Date;

  @Prop()
  duration: number;

  @Prop({ type: Number, default: 0 })
  progressPercentage: number;

  @Prop()
  currentStep: string;

  @Prop()
  estimatedTimeRemaining: number;

  @Prop({ type: [Object] })
  recommendations: Record<string, any>[];

  @Prop({ type: [String] })
  permissions: string[];

  @Prop()
  minimumSdkVersion: number;

  @Prop()
  targetSdkVersion: number;

  @Prop({ type: Boolean, default: true })
  certificateValid: boolean;

  @Prop()
  certificateFingerprint: string;

  @Prop({ type: Boolean, default: true })
  signatureValid: boolean;

  @Prop({ type: [String], default: [] })
  scanErrors: string[];

  @Prop({ type: [String], default: [] })
  warnings: string[];

  @Prop({ type: Boolean, default: false })
  fromCache: boolean;

  @Prop()
  cacheExpiresAt: Date;

  @Prop()
  apkFilePath: string;

  @Prop()
  apkUrl: string;

  @Prop({ index: true })
  userId: string;

  @Prop({ type: Object })
  debugInfo?: Record<string, any>;
}

export const ScanSchema = SchemaFactory.createForClass(Scan);
ScanSchema.index({ packageName: 1, versionCode: 1, level: 1 });
