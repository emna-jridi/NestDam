import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth/auth.controller';
import { UsersController } from './users/users.controller';
import { AuthService } from './auth/auth.service';
import { UsersService } from './users/users.service';
import { JwtStrategy } from './auth/jwt.strategy';
import { User, UserSchema } from './users/entities/user.entity';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { MailModule } from './mail/mail.module';
import { ScanModule } from './scan/scan.module';
import { AppRegistryModule } from './app-registry/app-registry.module';
import { ExternalApisModule } from './external-apis/external-apis.module';
import { AnalysisModule } from './analysis/analysis.module';
import { TrackerDetectorService } from './analysis/tracker-detector.service';
import { AvatarModule } from './avatar/avatar.module';

@Module({
  imports: [
    MongooseModule.forRoot('mongodb://localhost:27017/usermanagement'),
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    PassportModule,
    JwtModule.register({
      secret: 'your-secret-key-change-in-production',
      signOptions: { expiresIn: '15m' },
    }),
    UsersModule,
    AuthModule,
    MailModule,
    ScanModule,
    AppRegistryModule,
    ExternalApisModule,
    AnalysisModule,
    AvatarModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}