import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class GoogleLoginDto {
  @ApiProperty({
    description: 'Google ID Token returned by Google Sign-In SDK',
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6Ij...',
  })
  @IsNotEmpty({ message: 'Google ID token is required' })
  @IsString({ message: 'Google ID token must be a string' })
  idToken: string;
}
