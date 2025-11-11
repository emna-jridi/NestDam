import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, MinLength } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'johndoe' })
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'Doe' })
  @IsNotEmpty()
  surname: string;

  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'password123', minLength: 6 })
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: '+1234567890' })
  @IsOptional()
  @MinLength(11)
  phone?: string;

  @ApiProperty({ example: 'https://example.com/photo.jpg', required: false })
  @IsOptional()
  avatar?: string;
}
