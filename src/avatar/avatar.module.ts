import { Module } from '@nestjs/common';
import { AvatarService } from './avatar.service';
import { AvatarController } from './avatar.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Avatar, AvatarSchema } from './entities/avatar.schema';
import { User, UserSchema } from '../users/entities/user.entity';

@Module({
  imports: [

    MongooseModule.forFeature([
      {
        name: Avatar.name,
        schema: AvatarSchema
      },
      // Used to check that a userHash in the URL belongs to the JWT user
      { name: User.name, schema: UserSchema },
    ]),
  ],
  providers: [AvatarService],
  controllers: [AvatarController],
  exports: [AvatarService],
})
export class AvatarModule { }
