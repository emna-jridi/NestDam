import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';
import { MailService } from '../mail/mail.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { async } from 'rxjs';
import { ResetToken } from './entities/reset-token.schema';
import { User } from '../users/entities/user.entity';
import { addMinutes } from 'date-fns';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyResetCodeDto } from './dto/verify-reset-code.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private mailService: MailService,
    @InjectModel(ResetToken.name) private resetTokenModel: Model<ResetToken>,

    @InjectModel(User.name) private UserModel: Model<User>,

  ) { }
  async register(createUserDto: CreateUserDto) {
    // Create the new user
    const user = await this.usersService.create(createUserDto);

    // Return sanitized user data
    return {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatarUrl,
        userHash: user.userHash,
        isVerified: user.isVerified,

      },
    };
  }


  async login(loginDto: LoginDto) {
    const user = await this.usersService.findByEmail(loginDto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.generateTokens(user);
    await this.usersService.updateRefreshToken(user._id.toString(), tokens.refreshToken);

    return {
      ...tokens,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: 'your-refresh-secret-change-in-production',
      });

      const user = await this.usersService.findByEmail(payload.email);
      if (!user || !user.refreshToken) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const isValid = await bcrypt.compare(refreshToken, user.refreshToken);
      if (!isValid) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const tokens = await this.generateTokens(user);
      await this.usersService.updateRefreshToken(user._id.toString(), tokens.refreshToken);

      return tokens;
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }


  private generateResetCode(length = 6): string {
    const max = 10 ** length;
    const num = crypto.randomInt(0, max).toString().padStart(length, '0');
    return num;
  }
  // 1. Demander un code de réinitialisation
  async requestPasswordReset(forgotpasswordtDto: ForgotPasswordDto) {
    const user = await this.usersService.findByEmail(forgotpasswordtDto.email);

    // Pour la sécurité, ne pas révéler si l'email existe ou non
    if (!user) {
      return {
        message: 'Si cet email existe, un code de réinitialisation a été envoyé.'
      };
    }

    // Générer un code à 6 chiffres
    const resetCode = this.generateResetCode(6);
    const resetCodeHash = await bcrypt.hash(resetCode, 10);
    const expiry = addMinutes(new Date(), 15); // 15 minutes de validité

    user.resetPasswordCode = resetCodeHash;
    user.resetPasswordExpires = expiry;
    user.resetPasswordAttempts = 0;
    await user.save();
    console.log("🔍 Reset code before sending email:", resetCode);

    // Envoyer l'email avec le code
    await this.mailService.sendPasswordResetCode(user.email, user.name, resetCode);

    return {
      message: 'Si cet email existe, un code de réinitialisation a été envoyé.'
    };
  }

  // 2. Vérifier le code de réinitialisation
  async verifyResetCode(verifyResetCodeDto: VerifyResetCodeDto) {
    const user = await this.usersService.findByEmail(verifyResetCodeDto.email);
    if (!user) throw new NotFoundException('Utilisateur non trouvé');

    // Accept both fields for compatibility with clients
    const otp = (verifyResetCodeDto as any).otp ?? (verifyResetCodeDto as any).code ?? null;

    if (!otp || typeof otp !== 'string') {
      throw new BadRequestException('Le code est requis et doit être une chaîne de chiffres.');
    }

    // Basic format check (6 digits)
    if (!/^\d{6}$/.test(otp)) {
      throw new BadRequestException('Le code doit contenir uniquement 6 chiffres.');
    }

    if (!user.resetPasswordCode || !user.resetPasswordExpires) {
      throw new BadRequestException('Aucune demande de réinitialisation trouvée');
    }
    if (user.resetPasswordExpires < new Date()) {
      throw new BadRequestException('Le code a expiré. Veuillez demander un nouveau code.');
    }

    user.resetPasswordAttempts = (user.resetPasswordAttempts || 0) + 1;
    if (user.resetPasswordAttempts > 5) {
      await user.save();
      throw new BadRequestException('Trop de tentatives. Demandez un nouveau code.');
    }

    const isMatch = await bcrypt.compare(otp, user.resetPasswordCode);
    if (!isMatch) {
      await user.save();
      throw new BadRequestException('Code invalide');
    }

    user.resetPasswordAttempts = 0;
    await user.save();

    return { message: 'Code vérifié avec succès', verified: true };
  }

  // 3. Réinitialiser le mot de passe
  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const user = await this.usersService.findByEmail(resetPasswordDto.email);

    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    if (!user.resetPasswordCode || !user.resetPasswordExpires) {
      throw new BadRequestException('Aucune demande de réinitialisation valide');
    }

    if (user.resetPasswordExpires < new Date()) {
      throw new BadRequestException('Le code a expiré');
    }

    // Vérifier à nouveau le code
    const isMatch = await bcrypt.compare(
      resetPasswordDto.code,
      user.resetPasswordCode
    );

    if (!isMatch) {
      throw new BadRequestException('Code invalide');
    }

    // Changer le mot de passe
    const hashedPassword = await bcrypt.hash(resetPasswordDto.newPassword, 10);
    user.password = hashedPassword;

    // Nettoyer les données de réinitialisation
    user.resetPasswordCode = undefined;
    user.resetPasswordExpires = undefined;
    user.resetPasswordAttempts = 0;

    await user.save();


    return { message: 'Mot de passe réinitialisé avec succès' };
  }

  async generateTokens(user: any) {
    const payload = { email: user.email, sub: user._id.toString(), role: user.role };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, {
      secret: 'your-refresh-secret-change-in-production',
      expiresIn: '7d',
    });

    return {
      accessToken,
      refreshToken,
    };
  }


}
