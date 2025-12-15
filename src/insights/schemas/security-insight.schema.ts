import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SecurityInsightDocument = HydratedDocument<SecurityInsight>;

@Schema({ timestamps: true })
export class SecurityInsight {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ index: true })
  deviceId?: string;

  @Prop({ required: true, enum: ['week', 'month', 'quarter', 'year'] })
  period: string;

  @Prop({ required: true })
  startDate: Date;

  @Prop({ required: true })
  endDate: Date;

  @Prop({ type: Object, required: true })
  summary: {
    privacyScore: {
      current: number;
      average: number;
      change: number;
      trend: 'up' | 'down' | 'stable';
    };
    newRisks: number;
    resolvedRisks: number;
    appsScanned: number;
    totalScans: number;
  };

  @Prop({ type: Array, default: [] })
  topRisks: Array<{
    appName: string;
    packageName: string;
    riskLevel: string;
    description: string;
    firstDetected: Date;
  }>;

  @Prop({ type: Array, default: [] })
  recommendations: Array<{
    priority: 'high' | 'medium' | 'low';
    category: string;
    title: string;
    description: string;
    actionUrl?: string;
    impact?: {
      privacyScoreIncrease?: number;
      batterySavings?: string;
      privacyImprovement?: string;
    };
  }>;

  @Prop({ type: Object })
  trends: {
    privacyScore: Array<{ date: Date; score: number }>;
    riskDistribution: {
      high: number;
      medium: number;
      low: number;
      safe: number;
    };
  };

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop({ default: Date.now })
  updatedAt: Date;
}

export const SecurityInsightSchema =
  SchemaFactory.createForClass(SecurityInsight);

// Indexes
SecurityInsightSchema.index({ userId: 1, period: 1, startDate: -1 });
SecurityInsightSchema.index({ userId: 1, deviceId: 1, period: 1 });
SecurityInsightSchema.index({ userId: 1, createdAt: -1 });


