import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ScanDocument = HydratedDocument<Scan>;

@Schema({ timestamps: true })
export class Scan {
  @Prop({ required: true })
  type: string; // 'batch_installed' | 'ios_screenshot' | 'apk' | 'metadata' ...

  @Prop({ required: true })
  userHash: string;

  @Prop()
  platform?: 'android' | 'ios' | 'unknown';

  @Prop({ required: true })
  totalApps: number;

  @Prop({ type: Object })
  report: any;
  @Prop({ type: Object })
  summary: any;
  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;


  @Prop({
    type: String,
    default: 'BASIC_DONE',
  })
  status:
    | 'PENDING'
    | 'BASIC_DONE'
    | 'DEEP_ANALYZING'
    | 'COMPLETE';


  @Prop({ type: Object })
  deepAnalysis?: any;


  @Prop({ type: Number, default: null })
  finalScore?: number;


  @Prop({ type: Date, default: null })
  deepAnalysisRequestedAt?: Date;

  @Prop({ type: Date, default: null })
  deepAnalysisCompletedAt?: Date;
}

export const ScanSchema = SchemaFactory.createForClass(Scan);
