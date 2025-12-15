import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InsightsController } from './insights.controller';
import { InsightsService } from './insights.service';
import {
  SecurityInsight,
  SecurityInsightSchema,
} from './schemas/security-insight.schema';
import { Scan, ScanSchema } from '../scan/schemas/scan.schema';
import { ScanModule } from '../scan/scan.module';
import { PrivacyTipsModule } from '../privacy-tips/privacy-tips.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SecurityInsight.name, schema: SecurityInsightSchema },
      { name: Scan.name, schema: ScanSchema },
    ]),
    ScanModule,
    PrivacyTipsModule,
    RedisModule,
  ],
  controllers: [InsightsController],
  providers: [InsightsService],
  exports: [InsightsService],
})
export class InsightsModule {}


