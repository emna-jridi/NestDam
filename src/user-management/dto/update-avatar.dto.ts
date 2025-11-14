import { ApiProperty } from '@nestjs/swagger';
import { IsUrl, IsNotEmpty } from 'class-validator';

export class UpdateAvatarDto {
  @ApiProperty({
    description: 'URL of the new avatar image',
    example: 'https://example.com/avatar.jpg',
  })
  @IsNotEmpty()
  @IsUrl()
  avatar: string;
}
