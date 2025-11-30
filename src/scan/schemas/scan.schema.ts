import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Scan extends Document {
  @Prop({ required: true })
  type: string; // "apk" | "metadata" | "batch_installed" 

  @Prop()
  userHash?: string;

  @Prop()
  packageName?: string;

  @Prop()
  fileName?: string;

  @Prop()
  score?: number;

  @Prop()
  totalApps?: number;

  // Contient les résultats détaillés
  @Prop({ type: Object })
  report?: any;

  @Prop({ type: Object })
  summary?: {
    avgScore?: number;
    totalTrackers?: number;
    totalAlerts?: number;
    riskDistribution?: {
      critical: number;
      high: number;
      medium: number;
      low: number;
    };
    mostDangerousApps?: Array<{
      packageName: string;
      name: string;
      score: number;
    }>;
  };

  createdAt?: Date;
  updatedAt?: Date;
}

export const ScanSchema = SchemaFactory.createForClass(Scan);

//  INDEXES pour performance
ScanSchema.index({ userHash: 1, createdAt: -1 });
ScanSchema.index({ type: 1 });
ScanSchema.index({ packageName: 1 });