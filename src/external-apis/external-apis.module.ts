
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ExodusPrivacyService } from './exodus-privacy.service';
import { PlayStoreService } from './play-store.service';
import { MobsfService } from './mobsf.service';

@Module({
  imports: [HttpModule],
  providers: [ExodusPrivacyService, PlayStoreService, MobsfService],
  exports: [ExodusPrivacyService, PlayStoreService, MobsfService],
})
export class ExternalApisModule {}