import { ApiProperty } from '@nestjs/swagger';
import { BasicRoles } from '../enums/basic-roles.enum';

export class UserResponseDto {
  @ApiProperty({ example: '64b8f9f3a6c4b2a1d0e1f234' })
  _id: string;

  @ApiProperty({ example: 'user@example.com' })
  email: string;

  @ApiProperty({ example: 'John' })
  name: string;

  @ApiProperty({ example: 'Doe' })
  surname: string;

  @ApiProperty({ example: '+1234567890', required: false })
  phone?: string;

  @ApiProperty({
    example: 'https://api.dicebear.com/9.x/croodles/svg?seed=user@example.com',
    required: false,
  })
  avatar?: string;

  @ApiProperty({ enum: BasicRoles, example: BasicRoles.User })
  role: BasicRoles;

  @ApiProperty({ example: false })
  isDeviceRegistered: boolean;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  updatedAt: Date;
}
