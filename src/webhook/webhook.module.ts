import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { ScanModule } from '../scan/scan.module';

@Module({
  imports: [ScanModule],
  controllers: [WebhookController],
})
export class WebhookModule {}
