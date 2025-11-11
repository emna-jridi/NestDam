import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ timestamps: true })
export class App {
  @Prop({ required: true, unique: true })
  packageName: string;

  @Prop({ required: true })
  name: string;

  @Prop()
  developer: string;

  @Prop()
  category: string;

  @Prop()
  version: string;

  @Prop()
  iconUrl: string;

  @Prop()
  description: string;

  // Scores
  @Prop({ default: 50, min: 0, max: 100 })
  privacyScore: number;

  @Prop({ default: 0 })
  communityScore: number;

  // Métadonnées
  @Prop({ type: [String], default: [] })
  permissions: string[];

  @Prop({ type: [String], default: [] })
  trackers: string[];

  @Prop({ default: false })
  isDebuggable: boolean;

  @Prop({ type: Object })
  playStoreData: any;

  @Prop({ type: Object })
  exodusData: any;

  @Prop({ type: Object })
  mobsfData: any;

  // Stats
  @Prop({ default: 0 })
  scanCount: number;

  @Prop()
  lastScanned: Date;

  @Prop({ default: Date.now })
  lastUpdated: Date;
}

export const AppSchema = SchemaFactory.createForClass(App);

// Use HydratedDocument for proper typing
export type AppDocument = HydratedDocument<App>;

// Index pour recherche rapide
AppSchema.index({ packageName: 1 });
AppSchema.index({ name: 'text', developer: 'text' });
AppSchema.index({ privacyScore: -1 });
