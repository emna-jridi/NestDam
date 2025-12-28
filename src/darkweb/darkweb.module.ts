import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { DarkWebController } from './darkweb.controller';
import { DarkWebMonitoringService } from './darkweb.service';
import { Breach, BreachSchema } from './schemas/breach.schema';
import { UsersModule } from '../users/users.module';

import { HttpModule } from '@nestjs/axios';

@Module({
    imports: [
        MongooseModule.forFeature([{ name: Breach.name, schema: BreachSchema }]),
        ScheduleModule.forRoot(),
        UsersModule,
        HttpModule,
    ],
    controllers: [DarkWebController],
    providers: [DarkWebMonitoringService],
})
export class DarkWebModule { }
