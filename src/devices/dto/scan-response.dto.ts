import { ApiProperty } from '@nestjs/swagger';

export class ScanResponseDto {
  @ApiProperty({ example: '64a1f2e...' })
  scanId: string;

  @ApiProperty({ example: 2 })
  threatsFound: number;

  @ApiProperty({ example: 72 })
  riskScore: number;
}
