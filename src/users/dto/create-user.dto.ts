import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, MinLength } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'password123', minLength: 6 })
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: 'John Doe' })
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: '+1234567890' })
  @IsNotEmpty()
  phone: string;

  @ApiProperty({ example: '123 Main St, City' })
  @IsNotEmpty()
  address: string;

  @ApiProperty({ example: 'https://example.com/photo.jpg', required: false })
  avatarUrl?: string;
}