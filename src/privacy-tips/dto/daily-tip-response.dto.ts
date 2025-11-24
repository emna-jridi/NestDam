import { ApiProperty } from '@nestjs/swagger';
import { PrivacyTipResponseDto } from './privacy-tip-response.dto';

export class DailyTipResponseDto {
  @ApiProperty({ type: PrivacyTipResponseDto })
  tip: PrivacyTipResponseDto;

  @ApiProperty({ example: '2024-11-15' })
  date: string;
}
