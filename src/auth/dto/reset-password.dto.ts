import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({
    description: 'L\'email de l\'utilisateur',
    example: 'user@example.com'
  })
  @IsEmail({}, { message: 'Email invalide' })
  @IsNotEmpty({ message: 'L\'email est requis' })
  email: string;

  @ApiProperty({
    description: 'Le code de réinitialisation vérifié',
    example: '123456'
  })
  @IsString()
  @IsNotEmpty({ message: 'Le code est requis' })
  code: string;

  @ApiProperty({
    description: 'Le nouveau mot de passe',
    example: 'NewPassword123!'
  })
  @IsString()
  @IsNotEmpty({ message: 'Le mot de passe est requis' })
  @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caractères' })
  newPassword: string;
}