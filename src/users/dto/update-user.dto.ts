import { ApiProperty } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';

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

  @ApiProperty({ required: false })
  @IsOptional()
  image?: string;
}
