import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PlayStoreService } from './play-store.service';
import { MobsfService } from './mobsf.service';
import { EtipService } from './etip.service';
import { ExternalApisController } from './external-apis.controller';
import { CveDetailsService } from './services/cve-details.service';
import { VirusTotalService } from './services/virustotal.service';
import { KoodousService } from './services/koodous.service';
@Module({
  imports: [HttpModule],
  controllers: [ExternalApisController],
  providers: [PlayStoreService, MobsfService, EtipService, CveDetailsService,
    VirusTotalService,
    KoodousService,
  ],
  exports: [PlayStoreService, MobsfService, EtipService, CveDetailsService,
    VirusTotalService,
    KoodousService,
  ],
})
export class ExternalApisModule { }