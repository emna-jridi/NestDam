import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AlertDocument = Alert & Document;

@Schema({ timestamps: true })
export class Alert {
  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  packageName: string;

  @Prop({ required: true })
  event: string;

  @Prop()
  severity: 'critical' | 'high' | 'medium' | 'info';

  @Prop({ type: Object })
  details: any;

  @Prop()
  timestamp: number;

  @Prop({ default: false })
  notified: boolean;
}

export const AlertSchema = SchemaFactory.createForClass(Alert);
