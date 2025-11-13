import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../../user-management/services/users.service';
import { LoginDto } from '../dto/login.dto';
import * as bcrypt from 'bcrypt';
import { MailService } from '../../shared/mail/services/mail.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ResetToken } from '../entities/reset-token.schema';
import { User, UserDocument } from '../../user-management/entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private mailService: MailService,
    @InjectModel(ResetToken.name) private resetTokenModel: Model<ResetToken>,

    @InjectModel(User.name) private UserModel: Model<User>,
  ) {}

  async login(loginDto: LoginDto) {
    const user = await this.usersService.findByEmail(loginDto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = this.generateTokens(user);
    await this.usersService.updateRefreshToken(
      user._id.toString(),
      tokens.refreshToken,
    );

    return {
      ...tokens,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        surname: user.surname,
        phone: user.phone,
        role: user.role,
      },
    };
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify<{ email: string }>(refreshToken, {
        secret:
          process.env.REFRESH_TOKEN_SECRET ||
          'your-refresh-secret-change-in-production',
      });

      const user = await this.usersService.findByEmail(payload.email);
      if (!user || !user.refreshToken) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const isValid = await bcrypt.compare(refreshToken, user.refreshToken);
      if (!isValid) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const tokens = this.generateTokens(user);
      await this.usersService.updateRefreshToken(
        user._id.toString(),
        tokens.refreshToken,
      );

      return tokens;
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async forgotPassword(email: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      // Don't reveal if email exists (security best practice)
      return { message: 'If email exists, reset code will be sent' };
    }

    // Generate a 6-digit numeric OTP
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiryDate = new Date(Date.now() + 1000 * 60 * 15); // 15 minutes

    await this.resetTokenModel.create({
      token: code,
      userId: user._id,
      expiryDate,
    });

    // Send OTP via email (template-based)
    const emailSent = await this.mailService.sendResetPasswordCode(email, code);
    if (!emailSent) {
      console.error('Failed to send reset email to:', email);
    }

    // Always return a neutral message (don't reveal if email exists)
    return { message: 'If email exists, reset code will be sent' };
  }

  async verifyOtp(email: string, otp: string) {
    // Find the user first
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid OTP code');
    }

    // Find the OTP token for this user
    const token = await this.resetTokenModel.findOne({
      token: otp,
      userId: user._id,
      expiryDate: { $gte: new Date() },
    });

    if (!token) {
      throw new UnauthorizedException('Invalid or expired OTP code');
    }

    // OTP is valid - return success (don't delete it yet, user still needs to set password)
    return {
      message: 'OTP verified successfully',
      valid: true,
    };
  }

  async resetPassword(newPassword: string, resetToken: string, email?: string) {
    // Build query - if email provided, validate it matches
    const query: any = {
      token: resetToken,
      expiryDate: { $gte: new Date() },
    };

    // If email is provided, first find the user and add userId to query
    if (email) {
      const user = await this.usersService.findByEmail(email);
      if (!user) {
        throw new UnauthorizedException('Invalid or expired reset code');
      }
      query.userId = user._id;
    }

    // Find and DELETE the OTP code (one-time use)
    const token = await this.resetTokenModel.findOneAndDelete(query);

    if (!token) {
      throw new UnauthorizedException('Invalid or expired reset code');
    }

    // Find the user and update password
    const user = await this.UserModel.findById(token.userId);
    if (!user) {
      throw new InternalServerErrorException('User not found');
    }

    // Hash and save new password
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    return { message: 'Password successfully reset' };
  }

  private generateTokens(user: UserDocument) {
    const payload = {
      email: user.email,
      sub: user._id.toString(),
      role: user.role,
    };
    const accessToken = this.jwtService.sign(payload);

    // Refresh token uses separate secret and expiration (7 days)
    const refreshToken = this.jwtService.sign(payload, {
      secret:
        process.env.REFRESH_TOKEN_SECRET ||
        'your-refresh-secret-change-in-production',
      expiresIn: '7d',
    });

    return {
      accessToken,
      refreshToken,
    };
  }
}
