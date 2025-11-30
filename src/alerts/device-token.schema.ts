import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type DeviceTokenDocument = DeviceToken & Document;

@Schema({ timestamps: true })
export class DeviceToken {
  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  token: string;

  @Prop()
  platform: string; // 'android' | 'ios'
}

export const DeviceTokenSchema = SchemaFactory.createForClass(DeviceToken);
