import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose'; 

export type AppDocument = HydratedDocument<App>;

@Schema({ timestamps: true })
export class App {
  @Prop({ required: true, unique: true, index: true })
  packageName: string;

  @Prop({ required: true, index: 'text' })
  name: string;

  @Prop()
  developer: string;

  @Prop()
  category: string;

  @Prop()
  version: string;

  @Prop()
  iconUrl: string;

  @Prop()
  description: string;

  @Prop()
  rating: number;

  @Prop()
  installs: string;

  @Prop({ type: [String], default: [] })
  permissions: string[];

  @Prop({ type: [String], default: [] })
  trackers: string[];

  @Prop({ default: 50 })
  privacyScore: number;

  @Prop({ default: 'UNKNOWN' })
  riskLevel: string;

  @Prop()
  communityScore: number;

  @Prop({ default: false })
  isDebuggable: boolean;

  @Prop({ type: Object })
  playStoreData: any;

  @Prop({ type: Object })
  mobsfData: any;

  @Prop()
  lastScanned: Date;

  @Prop({ default: Date.now })
  lastUpdated: Date;

  @Prop({ default: 0 })
  scanCount: number;
}

export const AppSchema = SchemaFactory.createForClass(App);

AppSchema.index({ name: 'text', packageName: 'text', developer: 'text' });
AppSchema.index({ privacyScore: 1 });
AppSchema.index({ riskLevel: 1 });