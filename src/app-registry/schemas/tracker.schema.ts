import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Tracker extends Document {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop()
  company: string;

  @Prop()
  category: string; // Analytics, Ads, Crash Reporting, etc.

  @Prop()
  description: string;

  @Prop({ min: 1, max: 10 })
  privacyImpact: number; // 1=low, 10=critical

  @Prop()
  websiteUrl: string;

  @Prop()
  exodusId: number;
}

export const TrackerSchema = SchemaFactory.createForClass(Tracker);
