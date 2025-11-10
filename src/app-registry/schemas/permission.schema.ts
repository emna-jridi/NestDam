
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum PermissionRiskLevel {
  NORMAL = 'normal',
  DANGEROUS = 'dangerous',
  SIGNATURE = 'signature',
  CRITICAL = 'critical',
}

@Schema({ timestamps: true })
export class Permission extends Document {
  @Prop({ required: true, unique: true })
  name: string; // android.permission.CAMERA

  @Prop()
  displayName: string; 

  @Prop()
  category: string; 
  @Prop()
  description: string;

  @Prop({ enum: PermissionRiskLevel, default: PermissionRiskLevel.NORMAL })
  riskLevel: PermissionRiskLevel;

  @Prop({ min: 0, max: 100 })
  riskScore: number; // Impact sur le score global
}

export const PermissionSchema = SchemaFactory.createForClass(Permission);