import { ApiProperty } from '@nestjs/swagger';

export class PrivacyTipResponseDto {
  @ApiProperty({ example: '64b8f9f3a6c4b2a1d0e1f234' })
  _id: string;

  @ApiProperty({ example: 'Review App Permissions Regularly' })
  title: string;

  @ApiProperty({
    example:
      'Regularly review which apps have access to your location, camera, and contacts...',
  })
  content: string;

  @ApiProperty({
    example: 'permissions',
    enum: ['permissions', 'data_protection', 'app_security', 'general'],
  })
  category: string;

  @ApiProperty({
    example: 'high',
    enum: ['low', 'medium', 'high'],
  })
  priority: string;

  @ApiProperty({ example: 'location.fill', required: false })
  icon?: string;

  @ApiProperty({ example: true })
  actionable: boolean;

  @ApiProperty({ example: 'Review Permissions', required: false })
  actionText?: string;

  @ApiProperty({ example: false })
  aiGenerated: boolean;

  @ApiProperty({ example: '2024-11-15T10:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-11-15T10:00:00.000Z' })
  updatedAt: Date;
}
