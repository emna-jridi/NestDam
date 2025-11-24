import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserTipInteractionDocument = UserTipInteraction & Document;

@Schema({ timestamps: true })
export class UserTipInteraction {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'PrivacyTip', required: true })
  tipId: Types.ObjectId;

  @Prop({ default: false })
  viewed: boolean;

  @Prop({ default: false })
  bookmarked: boolean;

  @Prop({ default: false })
  completed: boolean;

  @Prop()
  viewedAt: Date;
}

export const UserTipInteractionSchema =
  SchemaFactory.createForClass(UserTipInteraction);

UserTipInteractionSchema.index({ userId: 1, tipId: 1 }, { unique: true });
UserTipInteractionSchema.index({ userId: 1, viewed: 1 });
