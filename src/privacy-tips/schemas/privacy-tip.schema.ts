import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PrivacyTipDocument = PrivacyTip & Document;

@Schema({ timestamps: true })
export class PrivacyTip {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  content: string;

  @Prop({
    required: true,
    enum: ['permissions', 'data_protection', 'app_security', 'general'],
  })
  category: string;

  @Prop({
    required: true,
    enum: ['low', 'medium', 'high'],
    default: 'medium',
  })
  priority: string;

  @Prop()
  icon: string;

  @Prop({ default: false })
  actionable: boolean;

  @Prop()
  actionText: string;

  @Prop({ default: false })
  aiGenerated: boolean;

  @Prop({ default: true })
  isActive: boolean;
}

export const PrivacyTipSchema = SchemaFactory.createForClass(PrivacyTip);

PrivacyTipSchema.index({ category: 1, isActive: 1 });
PrivacyTipSchema.index({ priority: -1, createdAt: -1 });
