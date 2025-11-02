import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';
import { MailService } from 'src/mail/mail.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
      private mailService: MailService,

  ) {}

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
        phone: user.phone,
        address: user.address,
        image: user.image,
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

    async forgotPassword(email: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      // Don't reveal if email exists (security best practice)
      return { message: 'If email exists, reset code will be sent' };
    }

    const resetCode = await this.usersService.setResetPasswordCode(email);

    // Send email with reset code
    const emailSent = await this.mailService.sendResetPasswordEmail(email, resetCode);

    if (!emailSent) {
      console.error('Failed to send reset email to:', email);
      // Still return success message for security
    }

    return { 
      message: 'Reset code sent to your email',
    };
  }

  async resetPassword(resetCode: string, newPassword: string) {
    await this.usersService.resetPassword(resetCode, newPassword);
    return { message: 'Password reset successful' };
  }

  private async generateTokens(user: any) {
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
