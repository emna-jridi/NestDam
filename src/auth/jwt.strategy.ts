import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../users/entities/user.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    private configService: ConfigService,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'your-secret-key-change-in-production',
    });
    
    const secret = configService.get<string>('JWT_SECRET') || 'your-secret-key-change-in-production';
    this.logger.log(`[JWT Strategy] Initialized with secret length: ${secret.length}`);
  }

  async validate(payload: any) {
    this.logger.debug(`[JWT Strategy] Validating token payload`);
    this.logger.debug(`[JWT Strategy] Payload: ${JSON.stringify({
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      userHash: payload.userHash,
      iat: payload.iat ? new Date(payload.iat * 1000).toISOString() : 'N/A',
      exp: payload.exp ? new Date(payload.exp * 1000).toISOString() : 'N/A',
    })}`);

    // Check if token is expired
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      this.logger.error(`[JWT Strategy] Token expired at ${new Date(payload.exp * 1000).toISOString()}`);
      throw new UnauthorizedException('Token expired');
    }

    // Verify user exists in database
    const userId = payload.sub;
    if (!userId) {
      this.logger.error(`[JWT Strategy] No userId (sub) in token payload`);
      throw new UnauthorizedException('Invalid token: missing user ID');
    }

    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      this.logger.error(`[JWT Strategy] User not found in DB: ${userId}`);
      throw new UnauthorizedException('User not found');
    }

    this.logger.log(`[JWT Strategy] ✓ Token validated for user: ${user.email} (${userId})`);

    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      userHash: payload.userHash,
    };
  }
}