import {
  IsString,
  Matches,
  MinLength,
  MaxLength,
  IsEmail,
  IsOptional,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({
    description: '6-digit OTP code received via email',
    example: '123456',
    minLength: 6,
    maxLength: 6,
  })
  @IsString()
  @MinLength(6)
  @MaxLength(6)
  @Matches(/^\d{6}$/, {
    message: 'Reset code must be a 6-digit number',
  })
  resetToken: string;

  @ApiProperty({
    description:
      'New password (minimum 6 characters, must contain at least one number)',
    example: 'NewPass123',
    minLength: 6,
  })
  @IsString()
  @MinLength(6)
  @Matches(/^(?=.*[0-9])/, {
    message: 'Password must contain at least one number',
  })
  newPassword: string;

  @ApiPropertyOptional({
    description:
      'Email address (optional but recommended for additional security)',
    example: 'user@example.com',
  })
  @IsOptional()
  @IsEmail()
  email?: string;
}
