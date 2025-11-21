import { Module } from '@nestjs/common';
import { LeakcheckService } from './leakcheck.service';
import { LeakcheckController } from './leakcheck.controller';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  providers: [LeakcheckService],
  controllers: [LeakcheckController],
  exports: [LeakcheckService],
})
export class LeakcheckModule {}
