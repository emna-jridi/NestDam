import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AlertDocument = HydratedDocument<Alert>;

@Schema({ timestamps: true })
export class Alert {
  @Prop({ required: true })
  userId: string;

  @Prop({ type: Types.ObjectId, ref: 'Device', required: false })
  deviceId?: Types.ObjectId;

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
