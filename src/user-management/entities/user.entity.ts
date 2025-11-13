import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { BasicRoles } from '../enums/basic-roles.enum';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  password: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  surname: string;

  @Prop({ unique: true })
  phone: string;

  @Prop()
  avatar?: string;

  @Prop({ type: String, enum: BasicRoles, default: BasicRoles.User })
  role: BasicRoles;

  @Prop()
  refreshToken: string;

  @Prop()
  resetPasswordCode: string;

  @Prop()
  resetPasswordExpires: Date;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Device' }], default: [] })
  devices: Types.ObjectId[];

  @Prop({ default: false })
  isDeviceRegistered: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);
