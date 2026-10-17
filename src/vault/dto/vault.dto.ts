import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsNumber, MaxLength } from 'class-validator';

/**
 * DTO for creating a new vault.
 * The client generates the salt, derives the vault key from the master password, and sends
 * only a one-way auth hash of that key: the master password never reaches the server.
 */
export class CreateVaultDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  salt: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  authHash: string;
}

/**
 * DTO for unlocking vault.
 * masterPassword is only accepted once, to upgrade a legacy (v1) vault to auth hashes.
 */
export class UnlockVaultDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  authHash: string;

  @IsOptional()
  @IsString()
  masterPassword?: string;
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
