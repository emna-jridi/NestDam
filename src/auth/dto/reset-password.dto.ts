import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ example: 'abc123resetcode' })
  @IsNotEmpty()
  resetCode: string;

  @ApiProperty({ example: 'newpassword123', minLength: 6 })
  @IsNotEmpty()
  @MinLength(6)
  newPassword: string;
}
