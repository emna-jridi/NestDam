import { Module } from '@nestjs/common';
import { AvatarService } from './avatar.service';
import { AvatarController } from './avatar.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Avatar, AvatarSchema } from './entities/avatar.schema';

@Module({
  imports: [

    MongooseModule.forFeature([
      {
        name: Avatar.name,
        schema: AvatarSchema
      }
    ]),
  ],
  providers: [AvatarService],
  controllers: [AvatarController],
  exports: [AvatarService],
})
export class AvatarModule { }
