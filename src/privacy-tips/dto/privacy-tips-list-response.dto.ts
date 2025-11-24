import { ApiProperty } from '@nestjs/swagger';
import { PrivacyTipResponseDto } from './privacy-tip-response.dto';

export class PrivacyTipsListResponseDto {
  @ApiProperty({ type: [PrivacyTipResponseDto] })
  tips: PrivacyTipResponseDto[];

  @ApiProperty({ example: 50 })
  total: number;

  @ApiProperty({ example: true })
  hasMore: boolean;
}
