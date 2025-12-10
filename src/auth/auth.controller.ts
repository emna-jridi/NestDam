import { Controller, Post, Body } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { UsersService } from 'src/users/users.service';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { VerifyResetCodeDto } from './dto/verify-reset-code.dto';
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private usersService: UsersService,
  ) { }

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 registrations per minute
  async register(@Body() createUserDto: CreateUserDto) {
    return this.authService.register(createUserDto);
  }
  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 login attempts per minute
  @ApiOperation({ summary: 'Login ' })
  login(@Body() loginDto: LoginDto) {

    return this.authService.login(loginDto);

  }

  @Post('refresh')
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 refreshes per minute
  @ApiOperation({ summary: 'Refresh access token' })
  refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refreshToken(refreshTokenDto.refreshToken);
  }



  // auth.controller.ts
  @Post('request-password-reset')
  @Throttle({ default: { limit: 3, ttl: 60000 } }) // 3 requests per minute
  @ApiOperation({ summary: 'Demander un code de réinitialisation de mot de passe' })
  requestPasswordReset(@Body() requestPasswordResetDto: ForgotPasswordDto) {
    return this.authService.requestPasswordReset(requestPasswordResetDto);
  }

  @Post('verify-reset-code')
  @ApiOperation({ summary: 'Vérifier le code de réinitialisation' })
  verifyResetCode(@Body() verifyResetCodeDto: VerifyResetCodeDto) {
    return this.authService.verifyResetCode(verifyResetCodeDto);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Réinitialiser le mot de passe' })
  resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }

  // OTP / email verification
  @Post('verify-email')  // ✅ fixed endpoint
  async verifyEmail(@Body() dto: VerifyOtpDto) {
    return this.usersService.verifyOtp(dto); // Reuse verifyOtp logic
  }
  @Post('verify-otp')
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.usersService.verifyOtp(dto);
  }
  @Post('resend-otp')
  @ApiOperation({ summary: 'Renvoyer un code OTP' })
  resendOtp(@Body() resendOtpDto: ResendOtpDto) {
    return this.usersService.resendOtp(resendOtpDto);
  }
}