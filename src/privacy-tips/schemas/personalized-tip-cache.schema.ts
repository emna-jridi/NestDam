import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PersonalizedTipCacheDocument = PersonalizedTipCache & Document;

@Schema({ timestamps: true })
export class PersonalizedTipCache {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: [Types.ObjectId], ref: 'PrivacyTip', required: true })
  tipIds: Types.ObjectId[];

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ type: Object })
  contextData: Record<string, any>;

  // AI Generation Metadata
  @Prop({ required: true })
  aiModel: string;

  @Prop({ required: true })
  generationId: string;

  @Prop({ required: true, type: String })
  prompt: string;

  @Prop({ type: Number, default: 0 })
  tokensUsed: number;

  @Prop({ type: Object, required: true })
  dataSummary: Record<string, any>;

  @Prop({ required: true })
  generatedAt: Date;
}

export const PersonalizedTipCacheSchema =
  SchemaFactory.createForClass(PersonalizedTipCache);

PersonalizedTipCacheSchema.index({ userId: 1, expiresAt: 1 });
PersonalizedTipCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index
PersonalizedTipCacheSchema.index({ generationId: 1 }); // For audit trail
