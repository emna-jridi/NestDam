import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type BreachDocument = Breach & Document;

@Schema({ timestamps: true })
export class Breach {
  @Prop({ required: true, index: true }) // Add index for faster queries
  userId: string;

  @Prop({ required: true })
  source: string; // e.g., "LinkedIn", "Adobe"

  @Prop()
  domain: string;

  @Prop()
  breachDate: string;

  @Prop()
  description: string;

  @Prop({ type: [String] })
  dataClasses: string[]; // e.g., ["Email", "Password", "IP Address"]

  @Prop({ default: false })
  isResolved: boolean;

  @Prop()
  logoPath: string;

  @Prop({ default: false })
  isVerified: boolean;
}

export const BreachSchema = SchemaFactory.createForClass(Breach);

// Create compound index for better query performance
BreachSchema.index({ userId: 1, breachDate: -1 });
