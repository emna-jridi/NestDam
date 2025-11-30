import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { User, UserSchema } from './users/entities/user.entity';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { MailModule } from './mail/mail.module';
import { ScanModule } from './scan/scan.module';
import { AppRegistryModule } from './app-registry/app-registry.module';
import { ExternalApisModule } from './external-apis/external-apis.module';
import { AnalysisModule } from './analysis/analysis.module';
import { AvatarModule } from './avatar/avatar.module';
import { GoogleModule } from './google/google.module';
import { ConfigModule } from '@nestjs/config';
<<<<<<< HEAD
import { RedisModule } from './redis/redis.module';
=======
import { AlertsModule } from './alerts/alerts.module';
import { ReportModule } from './report/report.module'; // 👈 Import this
>>>>>>> origin/report
@Module({
  imports: [

    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      cache: true,
    }),
    MongooseModule.forRoot('mongodb://localhost:27017/usermanagement'),
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    PassportModule,
    JwtModule.register({
      secret: 'your-secret-key-change-in-production',
      signOptions: { expiresIn: '15m' },
    }),
<<<<<<< HEAD
    RedisModule,
=======
    
>>>>>>> origin/report
    UsersModule,
    AuthModule,
    MailModule,
    ScanModule,
    AppRegistryModule,
    ExternalApisModule,
    AnalysisModule,
    AvatarModule,
    GoogleModule,
<<<<<<< HEAD
    RedisModule,
=======
    AlertsModule,
    ReportModule,
>>>>>>> origin/report
  ],
  controllers: [],
  providers: [],
})
export class AppModule { }