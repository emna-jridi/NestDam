import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SecurityReportDocument = HydratedDocument<SecurityReport>;

@Schema({ timestamps: true })
export class SecurityReport {
  @Prop({ required: true, unique: true, index: true })
  reportId: string;

  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ index: true })
  deviceId?: string;

  @Prop({
    required: true,
    enum: ['week', 'month', 'quarter', 'year', 'custom'],
  })
  timeRange: string;

  @Prop({ required: true })
  startDate: Date;

  @Prop({ required: true })
  endDate: Date;

  @Prop({ required: true, enum: ['pdf', 'json', 'html'] })
  format: string;

  @Prop({ required: false })
  filePath?: string; // Path to stored file (for PDF/HTML)

  @Prop()
  fileSize?: number; // File size in bytes

  @Prop({ type: Object })
  metadata: {
    includeCharts: boolean;
    includeRecommendations: boolean;
    generatedAt: Date;
    summary?: {
      privacyScore: number;
      totalScans: number;
    };
  };

  @Prop({ default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }) // Expires in 30 days
  expiresAt: Date;

  @Prop({ default: Date.now })
  createdAt: Date;
}

export const SecurityReportSchema =
  SchemaFactory.createForClass(SecurityReport);

// Indexes
SecurityReportSchema.index({ userId: 1, createdAt: -1 });
SecurityReportSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
SecurityReportSchema.index({ reportId: 1 });


