import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { UsersModule } from '../users/users.module';
import { MailModule } from '../mail/mail.module';
import { User, UserSchema } from '../users/entities/user.entity';
import { ResetToken, ResetTokenSchema } from './entities/reset-token.schema';
import { BiometricDevice, BiometricDeviceSchema } from './entities/biometric-device.schema';
import { BiometricChallenge, BiometricChallengeSchema } from './entities/biometric-challenge.schema';
import { BiometricService } from './biometric.service';
import { BiometricController } from './biometric.controller';

@Module({
  imports: [
    UsersModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    MailModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'your-secret-key-change-in-production',
        signOptions: { expiresIn: '24h' },
      }),
      inject: [ConfigService],
    }),
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: ResetToken.name, schema: ResetTokenSchema },
      { name: BiometricDevice.name, schema: BiometricDeviceSchema },
      { name: BiometricChallenge.name, schema: BiometricChallengeSchema },
    ]),
  ],
  controllers: [AuthController, BiometricController],
  providers: [AuthService, BiometricService, JwtStrategy, JwtAuthGuard],
  exports: [AuthService, BiometricService, JwtStrategy, JwtAuthGuard, PassportModule, JwtModule],
})
export class AuthModule {}