import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'apps' })
export class AppSchema extends Document {
  @Prop({ required: true, unique: true })
  packageName: string;

  @Prop({ required: false })
  appName?: string;

  @Prop({ required: false })
  platform?: 'android' | 'ios';

  @Prop({ type: Object, default: {} })
  permissions?: Record<string, any>;

  @Prop({ type: Object, default: {} })
  trackers?: Record<string, any>;

  @Prop({ type: Object, default: {} })
  storeData?: Record<string, any>;

  @Prop({ type: Object, default: {} })
  scanResults?: Record<string, any>;

  @Prop({ type: Object, default: {} })
  finalScore?: Record<string, any>;

  @Prop({ required: false })
  fileName?: string;

  @Prop({ required: false })
  mobsfHash?: string;

  @Prop({ required: false })
  scanType?: string;

  @Prop({ type: Date })
  lastScanned?: Date;

  @Prop({ type: Date })
  createdAt: Date;

  @Prop({ type: Date })
  updatedAt: Date;
}

export const AppSchemaFactory = SchemaFactory.createForClass(AppSchema);
