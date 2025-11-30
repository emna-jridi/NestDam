
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ExodusPrivacyService } from './exodus-privacy.service';
import { PlayStoreService } from './play-store.service';
import { MobsfService } from './mobsf.service';
import { EtipService } from './etip.service';

@Module({
  imports: [HttpModule],
  providers: [ExodusPrivacyService, PlayStoreService, MobsfService, EtipService],
  exports: [ExodusPrivacyService, PlayStoreService, MobsfService, EtipService],
})
export class ExternalApisModule {}