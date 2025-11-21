import { ApiProperty } from '@nestjs/swagger';

export class LeakcheckItemDto {
  @ApiProperty({ example: 'example@example.com' })
  email: string;

  @ApiProperty({
    description: 'Source object returned by leakcheck',
    required: false,
  })
  source: Record<string, any> | null;

  @ApiProperty({ example: 'Example', required: false })
  firstName?: string | null;

  @ApiProperty({ example: 'Example', required: false })
  lastName?: string | null;

  @ApiProperty({ example: 'leakcheck', required: false })
  username?: string | null;

  @ApiProperty({ example: ['first_name', 'last_name'], required: false })
  fields: string[];

  @ApiProperty({ example: '2019-07', required: false })
  lastSeen?: string | null;
}
