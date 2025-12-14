import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsArray, MinLength, MaxLength, IsIn } from 'class-validator';

const CATEGORIES = [
  'social',
  'email',
  'banking',
  'work',
  'shopping',
  'entertainment',
  'other',
];

/**
 * DTO for creating a new password entry
 * Note: encryptedPassword and encryptedNotes are already encrypted client-side
 */
export class CreatePasswordEntryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  site: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  username: string;

  @IsString()
  @IsNotEmpty()
  encryptedPassword: string; // Base64 encrypted password

  @IsOptional()
  @IsString()
  encryptedNotes?: string; // Base64 encrypted notes

  @IsOptional()
  @IsString()
  @MaxLength(500)
  url?: string;

  @IsOptional()
  @IsString()
  @IsIn(CATEGORIES)
  category?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  isFavorite?: boolean;
}

/**
 * DTO for updating a password entry
 */
export class UpdatePasswordEntryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  site?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  username?: string;

  @IsOptional()
  @IsString()
  encryptedPassword?: string;

  @IsOptional()
  @IsString()
  encryptedNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  url?: string;

  @IsOptional()
  @IsString()
  @IsIn(CATEGORIES)
  category?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  isFavorite?: boolean;
}

/**
 * DTO for analyzing password strength
 * Client sends plaintext password ONLY for analysis (never stored)
 */
export class AnalyzePasswordDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(128)
  password: string;
}

/**
 * Response DTO for password entry (excludes sensitive fields)
 */
export class PasswordEntryResponseDto {
  id: string;
  site: string;
  username: string;
  encryptedPassword: string;
  encryptedNotes?: string;
  url?: string;
  category: string;
  tags: string[];
  isFavorite: boolean;
  strengthScore?: number;
  strengthLevel?: string;
  estimatedCrackTime?: string;
  strengthIssues?: string[];
  aiRecommendations?: string[];
  lastPasswordChange: Date;
  lastAccessed: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * DTO for password strength analysis response
 */
export class PasswordStrengthResponseDto {
  score: number;
  level: string;
  crackTime: string;
  issues: string[];
  recommendations: string[];
}
