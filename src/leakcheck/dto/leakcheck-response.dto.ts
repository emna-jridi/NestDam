import { ApiProperty } from '@nestjs/swagger';
import { LeakcheckItemDto } from './leakcheck-item.dto';

export class LeakcheckResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 0 })
  found: number;

  @ApiProperty({ example: 400 })
  quota: number;

  @ApiProperty({ type: [LeakcheckItemDto] })
  results: LeakcheckItemDto[];
}
