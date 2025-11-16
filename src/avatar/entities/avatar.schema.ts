import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, HydratedDocument } from 'mongoose';

export type AvatarDocument = HydratedDocument<Avatar>;

@Schema({ timestamps: true })
export class Avatar  {
  @Prop({ required: true, unique: true })
  userHash: string;

  @Prop({ type: Object, required: true })
  config: {
    avatarStyle?: string;
    topType?: string;
    accessoriesType?: string;
    hairColor?: string;
    facialHairType?: string;
    facialHairColor?: string;
    clotheType?: string;
    clotheColor?: string;
    eyeType?: string;
    eyebrowType?: string;
    mouthType?: string;
    skinColor?: string;
  };

  @Prop({ required: true })
  fileName: string; 

  @Prop({ required: true })
  localPath: string; // Chemin local : /uploads/avatars/xxx.svg

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop({ default: Date.now })
  updatedAt: Date;
}

export const AvatarSchema = SchemaFactory.createForClass(Avatar);

// Index pour recherche rapide
AvatarSchema.index({ userHash: 1 });