import { ApiProperty } from '@nestjs/swagger';
import { IsUrl } from 'class-validator';

export class UpdateAvatarDto {
  @ApiProperty({ description: 'URL of the new avatar' })
  @IsUrl()
  avatar: string;
}
