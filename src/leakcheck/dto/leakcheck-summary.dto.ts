import { ApiProperty } from '@nestjs/swagger';

export class LeakcheckSummaryDto {
  @ApiProperty({
    description: 'Whether the email was found in breaches',
    example: true,
  })
  compromised: boolean;

  @ApiProperty({ description: 'Number of breaches found', example: 2 })
  breachesCount: number;

  @ApiProperty({
    description: 'Most recent breach date (YYYY-MM) or null',
    example: '2019-07',
    required: false,
  })
  lastSeen?: string | null;
}
