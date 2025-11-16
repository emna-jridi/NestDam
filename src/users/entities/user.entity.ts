import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, HydratedDocument, Types } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  password: string;

  @Prop({ required: true })
  name: string;

  @Prop({ default: 'user', enum: ['user', 'admin'] })
  role: string;

  @Prop()
  refreshToken: string;
  @Prop()
  resetPasswordCode?: string;

  @Prop()
  resetPasswordExpires?: Date;

  @Prop({ default: 0 })
  resetPasswordAttempts?: number;

  @Prop({ type: Types.ObjectId, ref: 'Avatar' })
  avatarId?: Types.ObjectId;

  @Prop()
  avatarFileName?: string; 
  @Prop({
    type: String,
    enum: ['local', 'google'],
    default: 'local',
  })
  provider: string;
  //  Hash unique pour l'avatar
  @Prop({ unique: true, sparse: true })
  userHash?: string;
  // OTP fields
  @Prop({ default: null })
  otpHash?: string;

  @Prop({ default: null })
  otpExpires?: Date;

  @Prop({ default: 0 })
  otpAttempts?: number;

  @Prop({ default: false })
  isVerified?: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);
