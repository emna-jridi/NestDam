
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ExodusPrivacyService } from './exodus-privacy.service';
import { PlayStoreService } from './play-store.service';
import { MobsfService } from './mobsf.service';
<<<<<<< HEAD
import { EtipService } from './etip.service';

@Module({
  imports: [HttpModule],
  providers: [ExodusPrivacyService, PlayStoreService, MobsfService, EtipService],
  exports: [ExodusPrivacyService, PlayStoreService, MobsfService, EtipService],
=======

@Module({
  imports: [HttpModule],
  providers: [ExodusPrivacyService, PlayStoreService, MobsfService],
  exports: [ExodusPrivacyService, PlayStoreService, MobsfService],
>>>>>>> origin/report
})
export class ExternalApisModule {}