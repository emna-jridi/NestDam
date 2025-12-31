import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { UsersModule } from './users/users.module';
import { VaultModule } from './vault/vault.module';
import { AlertsModule } from './alerts/alerts.module';
import { ReportModule } from './report/report.module';
import { DarkWebModule } from './darkweb/darkweb.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      cache: true,
    }),
    DatabaseModule,
    UsersModule,
    AuthModule,
    VaultModule,
    AlertsModule,
    ReportModule,
    DarkWebModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule { }