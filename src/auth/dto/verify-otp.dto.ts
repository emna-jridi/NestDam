// verify-otp.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, Length, Matches } from 'class-validator';

export class VerifyOtpDto {
  @ApiProperty({
    description: 'Le code OTP à vérifier',
    example: '123456',
    minLength: 6,
    maxLength: 6
  })
  @IsString()
  @IsNotEmpty({ message: 'Le code OTP est requis' })
  @Length(6, 6, { message: 'Le code OTP doit contenir 6 caractères' })
  @Matches(/^[0-9]+$/, { message: 'Le code OTP doit contenir uniquement des chiffres' })
  code: string;

  @ApiProperty({
    description: 'L\'email ou le téléphone de l\'utilisateur',
    example: 'user@example.com'
  })
  @IsString()
  @IsNotEmpty({ message: 'L\'identifiant est requis' })
  identifier: string; // email ou numéro de téléphone
}