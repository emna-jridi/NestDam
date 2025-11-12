import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './entities/user.entity';
import { TrackerDetectorService } from 'src/analysis/tracker-detector.service';
import { MailService } from 'src/mail/mail.service';
import { MailModule } from 'src/mail/mail.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    MailModule
  ],
  controllers: [UsersController],
  providers: [UsersService, MailService],
  exports: [UsersService, ],
})
export class UsersModule {}
