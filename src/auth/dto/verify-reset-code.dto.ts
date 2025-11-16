import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class VerifyResetCodeDto {
  @ApiProperty({
    description: 'L\'email de l\'utilisateur',
    example: 'user@example.com'
  })
  @IsEmail({}, { message: 'Email invalide' })
  @IsNotEmpty({ message: 'L\'email est requis' })
  email: string;

  @ApiProperty({
    description: 'Le code de réinitialisation à 6 chiffres',
    example: '123456'
  })
  @IsString()
  @IsNotEmpty({ message: 'Le code est requis' })
  @Length(6, 6, { message: 'Le code doit contenir 6 chiffres' })
  @Matches(/^[0-9]+$/, { message: 'Le code doit contenir uniquement des chiffres' })
  otp: string;
}