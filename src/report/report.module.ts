import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ReportController } from './report.controller';
import { ReportService } from './report.service';

@Module({
  imports: [ConfigModule],
  controllers: [ReportController],
  providers: [ReportService],
})
export class ReportModule {}