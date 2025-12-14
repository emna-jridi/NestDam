import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsNumber, MinLength, MaxLength } from 'class-validator';

/**
 * DTO for creating a new vault
 */
export class CreateVaultDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: 'Master password must be at least 8 characters' })
  masterPassword: string;
}

/**
 * DTO for unlocking vault
 */
export class UnlockVaultDto {
  @IsString()
  @IsNotEmpty()
  masterPassword: string;
}

/**
 * DTO for updating vault settings
 */
export class UpdateVaultSettingsDto {
  @IsOptional()
  @IsNumber()
  autoLockTimeout?: number;

  @IsOptional()
  @IsBoolean()
  paranoidMode?: boolean;

  @IsOptional()
  @IsBoolean()
  twoFactorEnabled?: boolean;
}

/**
 * DTO for vault unlock response
 */
export class VaultUnlockResponseDto {
  success: boolean;
  salt?: string;
  message?: string;
  vaultId?: string;
}

/**
 * DTO for vault statistics
 */
export class VaultStatsDto {
  totalPasswords: number;
  weakPasswords: number;
  reusedPasswords: number;
  oldPasswords: number;
  averageStrength: number;
}
