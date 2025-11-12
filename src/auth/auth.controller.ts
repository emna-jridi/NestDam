import { Controller, Post, Body } from '@nestjs/common';
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
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService, 
      private usersService: UsersService

  ) {}

   @Post('register')
async register(@Body() createUserDto: CreateUserDto) {
  return this.authService.register(createUserDto);
}
  @Post('login')
  @ApiOperation({ summary: 'Login ' })
  login(@Body() loginDto: LoginDto) {

    return this.authService.login(loginDto);

  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token' })
  refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refreshToken(refreshTokenDto.refreshToken);
  }



  @Post('forgot-password')
  @ApiOperation({ summary: 'Request password reset code' })
  forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto.email);
  }

@Post('reset-password')
@ApiBody({
  schema: {
    example: {
      newPassword: 'MyNewPassword123',
      resetToken: 'a2b3c4d5e6...',
    },
  },
})
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.newPassword, dto.resetToken);
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