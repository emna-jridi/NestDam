import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PlayStoreService } from './play-store.service';
import { MobsfService } from './mobsf.service';
import { EtipService } from './etip.service';
import { ExternalApisController } from './external-apis.controller';
@Module({
  imports: [HttpModule],
  controllers: [ExternalApisController],
  providers: [PlayStoreService, MobsfService, EtipService],
  exports: [PlayStoreService, MobsfService, EtipService],
})
export class ExternalApisModule { }