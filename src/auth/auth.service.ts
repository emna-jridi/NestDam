import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';
import { MailService } from '../mail/mail.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
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
  ) {}

  // ================================================
  // REGISTER
  // ================================================
  async register(createUserDto: CreateUserDto) {
    const user = await this.usersService.create(createUserDto);

    return {
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarFileName: user.avatarFileName,
        userHash: user.userHash,
        provider: user.provider,
        isVerified: user.isVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    };
  }

  // ================================================
  // LOGIN
  // ================================================
  async login(loginDto: LoginDto) {
    const user = await this.usersService.findByEmail(loginDto.email);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.password,
    );
    if (!isPasswordValid) throw new UnauthorizedException('Invalid credentials');

    const tokens = await this.generateTokens(user);
    await this.usersService.updateRefreshToken(
      user._id.toString(),
      tokens.refreshToken,
    );

    // 🔥 CORRECT USER OBJECT (avec userHash + avatar + provider)
    return {
      ...tokens,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarFileName: user.avatarFileName,
        userHash: user.userHash,
        provider: user.provider,
        isVerified: user.isVerified,
       
      },
    };
  }

  // ================================================
  // REFRESH TOKEN (corrigé)
  // ================================================
  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: 'your-refresh-secret-change-in-production',
      });

      const user = await this.usersService.findByEmail(payload.email);
      if (!user || !user.refreshToken)
        throw new UnauthorizedException('Invalid refresh token');

      const isValid = await bcrypt.compare(refreshToken, user.refreshToken);
      if (!isValid) throw new UnauthorizedException('Invalid refresh token');

      const tokens = await this.generateTokens(user);
      await this.usersService.updateRefreshToken(
        user._id.toString(),
        tokens.refreshToken,
      );

      // 🔥 Retourner l'objet user COMPLET
      return {
        ...tokens,
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
          avatarFileName: user.avatarFileName,
          userHash: user.userHash,
          provider: user.provider,
          isVerified: user.isVerified,
         
        },
      };
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  // ================================================
  // PASSWORD RESET + OTP  (inchangé)
  // ================================================

  private generateResetCode(length = 6): string {
    const max = 10 ** length;
    const num = crypto
      .randomInt(0, max)
      .toString()
      .padStart(length, '0');
    return num;
  }

  async requestPasswordReset(dto: ForgotPasswordDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user)
      return {
        message: 'Si cet email existe, un code de réinitialisation a été envoyé.',
      };

    const resetCode = this.generateResetCode(6);
    const resetCodeHash = await bcrypt.hash(resetCode, 10);
    const expiry = addMinutes(new Date(), 15);

    user.resetPasswordCode = resetCodeHash;
    user.resetPasswordExpires = expiry;
    user.resetPasswordAttempts = 0;
    await user.save();

    await this.mailService.sendPasswordResetCode(
      user.email,
      user.name,
      resetCode,
    );

    return {
      message: 'Si cet email existe, un code de réinitialisation a été envoyé.',
    };
  }

  async verifyResetCode(dto: VerifyResetCodeDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) throw new NotFoundException('Utilisateur non trouvé');

    const otp =
      (dto as any).otp ?? (dto as any).code ?? null;
    if (!otp || typeof otp !== 'string')
      throw new BadRequestException('Le code est requis');

    if (!/^\d{6}$/.test(otp))
      throw new BadRequestException('Format invalide');

    if (!user.resetPasswordCode || !user.resetPasswordExpires)
      throw new BadRequestException('Aucune demande de réinitialisation');

    if (user.resetPasswordExpires < new Date())
      throw new BadRequestException('Code expiré');

    user.resetPasswordAttempts = (user.resetPasswordAttempts || 0) + 1;
    if (user.resetPasswordAttempts > 5) {
      await user.save();
      throw new BadRequestException(
        'Trop de tentatives. Demandez un nouveau code.',
      );
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

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) throw new NotFoundException('Utilisateur non trouvé');

    if (!user.resetPasswordCode || !user.resetPasswordExpires)
      throw new BadRequestException('Aucune demande trouvée');

    if (user.resetPasswordExpires < new Date())
      throw new BadRequestException('Code expiré');

    const isMatch = await bcrypt.compare(
      dto.code,
      user.resetPasswordCode,
    );
    if (!isMatch) throw new BadRequestException('Code invalide');

    user.password = await bcrypt.hash(dto.newPassword, 10);
    user.resetPasswordCode = undefined;
    user.resetPasswordExpires = undefined;
    user.resetPasswordAttempts = 0;
    await user.save();

    return { message: 'Mot de passe réinitialisé avec succès' };
  }

  // ================================================
  // JWT GENERATION
  // ================================================
  async generateTokens(user: any) {
    const payload = {
      email: user.email,
      sub: user._id.toString(),
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, {
      secret: 'your-refresh-secret-change-in-production',
      expiresIn: '7d',
    });

    return { accessToken, refreshToken };
  }
}
