import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PasswordEntryDocument = PasswordEntry & Document;

export enum PasswordCategory {
  SOCIAL = 'social',
  EMAIL = 'email',
  BANKING = 'banking',
  WORK = 'work',
  SHOPPING = 'shopping',
  ENTERTAINMENT = 'entertainment',
  OTHER = 'other',
}

export enum PasswordStrengthLevel {
  CRITICAL = 'Critical',
  WEAK = 'Weak',
  MEDIUM = 'Medium',
  STRONG = 'Strong',
  VERY_STRONG = 'Very Strong',
}

@Schema({ timestamps: true })
export class PasswordEntry {
  @Prop({ type: Types.ObjectId, ref: 'Vault', required: true })
  vaultId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  site: string; // e.g., "gmail.com" or "My Bank"

  @Prop()
  url: string; // Optional full URL

  @Prop({ required: true })
  username: string; // email or username

  @Prop({ required: true })
  encryptedPassword: string; // AES-256-GCM encrypted, Base64 encoded

  @Prop()
  encryptedNotes: string; // Encrypted notes (optional)

  @Prop({ type: String, enum: PasswordCategory, default: PasswordCategory.OTHER })
  category: PasswordCategory;

  @Prop({ default: false })
  isFavorite: boolean;

  @Prop({ type: [String], default: [] })
  encryptedAttachments: string[]; // Array of encrypted file references

  // AI/Heuristic Analysis Results
  @Prop({ type: Number, min: 0, max: 100 })
  strengthScore: number; // 0-100

  @Prop({ type: String, enum: PasswordStrengthLevel })
  strengthLevel: PasswordStrengthLevel;

  @Prop()
  estimatedCrackTime: string; // e.g., "2 hours", "10 years"

  @Prop({ type: [String], default: [] })
  strengthIssues: string[]; // ["Too short", "Common pattern"]

  @Prop({ type: [String], default: [] })
  aiRecommendations: string[]; // AI-generated suggestions

  @Prop({ type: Date })
  lastPasswordChange: Date;

  @Prop({ type: Date })
  lastAccessed: Date;

  @Prop({ type: Date })
  createdAt: Date;

  @Prop({ type: Date })
  updatedAt: Date;
}

export const PasswordEntrySchema = SchemaFactory.createForClass(PasswordEntry);

// Indexes
PasswordEntrySchema.index({ vaultId: 1, userId: 1 });
PasswordEntrySchema.index({ userId: 1, isFavorite: 1 });
PasswordEntrySchema.index({ site: 'text', username: 'text' }); // Text search
PasswordEntrySchema.index({ category: 1 });
