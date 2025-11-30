import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './entities/user.entity';
import { MailService } from 'src/mail/mail.service';
import { MailModule } from 'src/mail/mail.module';
import { AvatarModule } from 'src/avatar/avatar.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    MailModule, AvatarModule
  ],
  controllers: [UsersController],
  providers: [UsersService, MailService,],
  exports: [UsersService, ],
})
export class UsersModule {}
