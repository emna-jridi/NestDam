// src/modules/google/google.service.ts

import {
  Injectable,
  UnauthorizedException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import { GoogleLoginDto } from '../auth/dto/google-login.dto';
import { UsersService } from '../users/users.service';

@Injectable()
export class GoogleService implements OnModuleInit {
  private readonly logger = new Logger(GoogleService.name);
  private client: OAuth2Client;

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) { }

  /**
   * Initialiser le client Google OAuth au démarrage du module
   */
  onModuleInit() {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');

    // Vérifier que les credentials existent
    if (!clientId) {
      this.logger.error('❌ GOOGLE_CLIENT_ID is missing in .env file');
      throw new Error('Google Client ID is not configured');
    }

    if (!clientSecret) {
      this.logger.warn('⚠️ GOOGLE_CLIENT_SECRET is missing (optional for ID token verification)');
    }

    // Initialiser le client OAuth2
    this.client = new OAuth2Client(clientId);

    this.logger.log('✅ Google OAuth Client initialized successfully');
    this.logger.log(`📋 Client ID: ${clientId.substring(0, 20)}...`);
  }

  /**
   * Vérifier et valider un ID Token Google
   */
  async verifyGoogleToken(idToken: string) {
    try {
      const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');

      // Vérifier le token auprès de Google
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: clientId, // Audience doit correspondre au Client ID
      });

      const payload = ticket.getPayload();

      if (!payload) {
        this.logger.warn('⚠️ Google token payload is empty');
        throw new UnauthorizedException('Invalid Google token: empty payload');
      }

      // Vérifier les champs essentiels
      if (!payload.email) {
        this.logger.warn('⚠️ Google token has no email');
        throw new UnauthorizedException('Invalid Google token: no email');
      }

      this.logger.log(`✅ Google token verified successfully for: ${payload.email}`);

      return payload;
    } catch (error) {
      this.logger.error(`❌ Google token verification failed: ${error.message}`);

      if (error instanceof UnauthorizedException) {
        throw error;
      }

      // Erreurs spécifiques de google-auth-library
      if (error.message.includes('Token used too late')) {
        throw new UnauthorizedException('Google token has expired');
      }

      if (error.message.includes('Invalid token signature')) {
        throw new UnauthorizedException('Invalid Google token signature');
      }

      throw new UnauthorizedException('Invalid Google token');
    }
  }

  /**
   * Authentifier un utilisateur avec Google
   */
  async loginWithGoogle(googleDto: GoogleLoginDto) {
    try {
      this.logger.log('🔐 Starting Google authentication...');

      // 1. Vérifier le token Google
      const payload = await this.verifyGoogleToken(googleDto.idToken);

      const email = payload.email!;
      const name = payload.name || 'Google User';
      const picture = payload.picture;
      const providerId = payload.sub; // ID Google unique
      const emailVerified = payload.email_verified || false;

      this.logger.log(` Email from Google: ${email}`);
      let user = await this.usersService.findByEmail(email);
      if (!user) {
        this.logger.log(` Creating new user from Google: ${email}`);
        user = await this.usersService.createGoogleUser({
          email,
          name,
          provider: 'google',
        });

      } else {
        this.logger.log(`Existing user found: ${user._id}`);

        let updated = false;

        if (user.provider !== 'google') {
          user.provider = 'google';

          updated = true;
          this.logger.log(`Linked existing account to Google`);
        }
        if (!user.isVerified && emailVerified) {
          user.isVerified = true;
          updated = true;
        }

        if (updated) {
          await user.save();
          this.logger.log(` User info updated`);
        }
      }
      if (!user) {
        this.logger.error('User creation/retrieval failed');
        throw new UnauthorizedException('Failed to authenticate user');
      }
      // 5. Générer un JWT token
      const accessToken = this.generateJwtToken(user);
      this.logger.log(`🎫 JWT token generated for user: ${user._id}`);

      return {
        user: this.usersService.sanitizeUser(user),
        access_token: accessToken,
        message: 'Google login successful',
      };
    } catch (error) {
      this.logger.error(` Google login failed: ${error.message}`);
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Google authentication failed');
    }
  }


  private generateJwtToken(user: any): string {
    const payload = {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
      provider: user.provider,
    };

    const expiresIn = this.configService.get<string>('JWT_EXPIRATION', '7d');

    const token = this.jwtService.sign(payload);

    this.logger.log(`🔑 JWT token generated (expires in: ${expiresIn})`);

    return token;
  }

  /**
   * Vérifier si un ID Token Google est valide (utilitaire)
   */
  async validateGoogleToken(idToken: string): Promise<boolean> {
    try {
      await this.verifyGoogleToken(idToken);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Obtenir les informations d'un utilisateur depuis un ID Token
   * (sans créer de compte ni générer de JWT)
   */
  async getGoogleUserInfo(idToken: string) {
    const payload = await this.verifyGoogleToken(idToken);

    return {
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
      emailVerified: payload.email_verified,
      locale: payload.locale,
    };
  }
}