import { Module } from '@nestjs/common';
import { LeakcheckService } from './leakcheck.service';
import { LeakcheckController } from './leakcheck.controller';

@Module({
  providers: [LeakcheckService],
  controllers: [LeakcheckController],
  exports: [LeakcheckService],
})
export class LeakcheckModule {}
