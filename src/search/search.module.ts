import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { App, AppSchema } from '../app-registry/schemas/app.schema';
import { Alert, AlertSchema } from '../alerts/alert.schema';
import {
  PrivacyTip,
  PrivacyTipSchema,
} from '../privacy-tips/schemas/privacy-tip.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: App.name, schema: AppSchema },
      { name: Alert.name, schema: AlertSchema },
      { name: PrivacyTip.name, schema: PrivacyTipSchema },
    ]),
  ],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
