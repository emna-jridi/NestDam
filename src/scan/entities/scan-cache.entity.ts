import { Schema, SchemaFactory, Prop } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, expireAfterSeconds: 2592000 }) // 30 days
export class ScanCache extends Document {
  @Prop({ required: true, unique: true, index: true })
  cacheKey: string; // SHA256(packageName + versionCode + level + analysisType)

  @Prop({ required: true, index: true })
  packageName: string;

  @Prop({ required: true })
  versionCode: string;

  @Prop({ required: true, enum: ['SMART', 'DEEP'] })
  level: string;

  @Prop({ required: true, enum: ['installed_app', 'apk_upload'] })
  analysisType: string;

  @Prop({ type: Object, required: true })
  scanResult: Record<string, any>;

  @Prop({ type: Date, default: () => new Date() })
  createdAt: Date;

  @Prop()
  expiresAt: Date;

  @Prop()
  sourceUrl?: string;

  @Prop({ type: Boolean, default: false })
  isStale: boolean;
}

export const ScanCacheSchema = SchemaFactory.createForClass(ScanCache);
ScanCacheSchema.index({ cacheKey: 1 });
ScanCacheSchema.index({ packageName: 1, versionCode: 1, level: 1 });
