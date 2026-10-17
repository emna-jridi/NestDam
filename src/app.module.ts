import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { CustomThrottlerGuard } from './auth/throttle.guard';
import { DatabaseModule } from './database/database.module';
import { UsersModule } from './users/users.module';
import { VaultModule } from './vault/vault.module';
import { AlertsModule } from './alerts/alerts.module';
import { ReportModule } from './report/report.module';
import { DarkWebModule } from './darkweb/darkweb.module';
import { ScanModule } from './scan/scan.module';
import { AvatarModule } from './avatar/avatar.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      cache: true,
    }),
    // Generous app-wide default (scan polling); auth routes set stricter limits with @Throttle
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 300 }]),
    DatabaseModule,
    UsersModule,
    AuthModule,
    VaultModule,
    AlertsModule,
    ReportModule,
    DarkWebModule,
    ScanModule,
    AvatarModule,
  ],
  controllers: [],
  providers: [{ provide: APP_GUARD, useClass: CustomThrottlerGuard }],
})
export class AppModule { }
