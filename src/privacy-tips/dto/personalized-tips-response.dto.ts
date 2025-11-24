import { ApiProperty } from '@nestjs/swagger';
import { PrivacyTipResponseDto } from './privacy-tip-response.dto';

export class PersonalizedTipResponseDto extends PrivacyTipResponseDto {
  @ApiProperty({ example: true })
  personalized: boolean;

  @ApiProperty({ example: 'app_usage_data', required: false })
  basedOn?: string;

  @ApiProperty({
    example: 'Consider disabling location access when not needed',
    required: false,
  })
  recommendation?: string;

  // AI Generation Metadata
  @ApiProperty({
    example: 'gemini-1.5-flash',
    description: 'AI model used for generation',
  })
  aiModel: string;

  @ApiProperty({
    example: 'gen_1732234567890',
    description: 'Unique generation ID for this batch',
  })
  generationId: string;

  @ApiProperty({
    example: '2024-11-15T10:00:00.000Z',
    description: 'Timestamp when tips were generated',
  })
  generationTimestamp: string;

  @ApiProperty({
    example: [
      'user_profile',
      'scan_history',
      'app_permissions',
      'security_alerts',
      'privacy_score',
    ],
    description: 'Data sources used for personalization',
    type: [String],
  })
  dataUsed: string[];
}

export class PersonalizedTipsListResponseDto {
  @ApiProperty({ type: [PersonalizedTipResponseDto] })
  tips: PersonalizedTipResponseDto[];

  @ApiProperty({ example: '2024-11-15T10:00:00.000Z' })
  generatedAt: Date;

  @ApiProperty({ example: '2024-11-16T10:00:00.000Z' })
  expiresAt: Date;

  @ApiProperty({
    example: 'gemini-1.5-flash',
    description: 'AI model used for generation',
  })
  aiModel: string;

  @ApiProperty({
    example: 'gen_1732234567890',
    description: 'Unique generation ID for this batch',
  })
  generationId: string;

  @ApiProperty({
    example: false,
    description: 'Whether tips were force regenerated',
  })
  forceRegenerate: boolean;
}
