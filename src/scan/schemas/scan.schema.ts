import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Scan extends Document {
  @Prop({ required: true })
  type: string; // "apk" ou "metadata"

  @Prop()
  packageName?: string;

  @Prop()
  fileName?: string;

  @Prop()
  score?: number;

  @Prop({ type: Object })
  report?: any;
  createdAt?: Date;
  updatedAt?: Date;
}

export const ScanSchema = SchemaFactory.createForClass(Scan);
