import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsUrl } from 'class-validator';

export class UpdateUserDto {
  @ApiProperty({ required: false })
  @IsOptional()
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  phone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  address?: string;

  @IsOptional()
  @IsUrl()
  avatar?: string;
}
