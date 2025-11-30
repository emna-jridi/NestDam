// src/modules/avatar/dto/create-avatar.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class CreateAvatarDto {
  @ApiProperty({
    description: 'Hash unique de l\'utilisateur',
    example: 'user123abc',
  })
  @IsString()
  @IsNotEmpty()
  userHash: string;

  @ApiPropertyOptional({
    description: 'Style de l\'avatar',
    enum: ['Circle', 'Transparent'],
    default: 'Circle',
    example: 'Circle',
  })
  @IsOptional()
  @IsString()
  avatarStyle?: string;

  @ApiPropertyOptional({
    description: 'Type de coiffure',
    enum: [
      'NoHair',
      'ShortHairShortFlat',
      'ShortHairShortRound',
      'ShortHairShortWaved',
      'LongHairStraight',
      'LongHairCurly',
      'Hijab',
      'Hat',
    ],
    example: 'ShortHairShortFlat',
  })
  @IsOptional()
  @IsString()
  topType?: string;

  @ApiPropertyOptional({
    description: 'Type d\'accessoires',
    enum: ['Blank', 'Kurt', 'Prescription02', 'Sunglasses', 'Wayfarers'],
    example: 'Prescription02',
  })
  @IsOptional()
  @IsString()
  accessoriesType?: string;

  @ApiPropertyOptional({
    description: 'Couleur des cheveux',
    enum: ['Auburn', 'Black', 'Blonde', 'Brown', 'BrownDark', 'Red'],
    example: 'Black',
  })
  @IsOptional()
  @IsString()
  hairColor?: string;

  @ApiPropertyOptional({
    description: 'Type de pilosité faciale',
    enum: ['Blank', 'BeardMedium', 'BeardLight', 'MoustacheFancy'],
    example: 'Blank',
  })
  @IsOptional()
  @IsString()
  facialHairType?: string;

  @ApiPropertyOptional({
    description: 'Couleur de la pilosité faciale',
    enum: ['Auburn', 'Black', 'Blonde', 'Brown', 'BrownDark', 'Red'],
    example: 'Black',
  })
  @IsOptional()
  @IsString()
  facialHairColor?: string;

  @ApiPropertyOptional({
    description: 'Type de vêtements',
    enum: [
      'BlazerShirt',
      'Hoodie',
      'ShirtCrewNeck',
      'ShirtVNeck',
      'GraphicShirt',
    ],
    example: 'Hoodie',
  })
  @IsOptional()
  @IsString()
  clotheType?: string;

  @ApiPropertyOptional({
    description: 'Couleur des vêtements',
    enum: ['Black', 'Blue01', 'Blue02', 'Red', 'Gray01', 'White'],
    example: 'Blue01',
  })
  @IsOptional()
  @IsString()
  clotheColor?: string;

  @ApiPropertyOptional({
    description: 'Type d\'yeux',
    enum: ['Default', 'Happy', 'Squint', 'Wink', 'Surprised'],
    example: 'Default',
  })
  @IsOptional()
  @IsString()
  eyeType?: string;

  @ApiPropertyOptional({
    description: 'Type de sourcils',
    enum: ['Default', 'RaisedExcited', 'SadConcerned'],
    example: 'Default',
  })
  @IsOptional()
  @IsString()
  eyebrowType?: string;

  @ApiPropertyOptional({
    description: 'Type de bouche',
    enum: ['Default', 'Smile', 'Twinkle', 'Serious', 'Sad'],
    example: 'Smile',
  })
  @IsOptional()
  @IsString()
  mouthType?: string;

  @ApiPropertyOptional({
    description: 'Couleur de peau',
    enum: ['Tanned', 'Pale', 'Light', 'Brown', 'DarkBrown', 'Black'],
    example: 'Light',
  })
  @IsOptional()
  @IsString()
  skinColor?: string;
}