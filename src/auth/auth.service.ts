import { Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';
import { MailService } from 'src/mail/mail.service';
import { CreateUserDto } from 'src/users/dto/create-user.dto';
import { nanoid } from 'nanoid';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { async } from 'rxjs';
import { ResetToken } from './entities/reset-token.schema';
import { User } from 'src/users/entities/user.entity';

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

  // Generate DiceBear avatar (you already do this inside create())
  const avatarUrl = `https://api.dicebear.com/8.x/adventurer/svg?seed=${encodeURIComponent(createUserDto.email)}`;

  // Return sanitized user data
  return {
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      address: user.address,
      role: user.role,
      avatar: user.avatar || avatarUrl, // ✅ fallback if missing
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
        phone: user.phone,
        address: user.address,
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


    if (user) {
      //If user exists, generate password reset link
      const expiryDate = new Date();
      expiryDate.setHours(expiryDate.getHours() + 1);

      const resetToken = nanoid(64);
      await this.resetTokenModel.create({
        token: resetToken,
        userId: user._id,
        expiryDate,
      });
      // Send email with reset code
      const emailSent = await this.mailService.sendResetPasswordEmail(email, resetToken);

      if (!emailSent) {
        console.error('Failed to send reset email to:', email);
        // Still return success message for security
      }

      return {
        message: 'Reset code sent to your email',
        token: resetToken 
      };
    }
  }

  async resetPassword(newPassword: string, resetToken: string) {
    //Find a valid reset token document
    const token = await this.resetTokenModel.findOneAndDelete({
      token: resetToken,
      expiryDate: { $gte: new Date() },
    });

    if (!token) {
      throw new UnauthorizedException('Invalid link');
    }

    //Change user password (MAKE SURE TO HASH!!)
    const user = await this.UserModel.findById(token.userId);
    if (!user) {
      throw new InternalServerErrorException();
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
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
