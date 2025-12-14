import { Injectable, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Vault, VaultDocument } from '../schemas/vault.schema';
import { PasswordEntry, PasswordEntryDocument } from '../schemas/password-entry.schema';
import { CryptoService } from './crypto.service';
import { PasswordStrengthService } from './password-strength.service';

/**
 * Main service for vault operations
 * Implements security rules: rate limiting, auto-lock, paranoid mode
 */
@Injectable()
export class VaultService {
  private readonly MAX_UNLOCK_ATTEMPTS = 5;
  private readonly LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes
  private readonly PARANOID_WIPE_THRESHOLD = 10;

  constructor(
    @InjectModel(Vault.name) private vaultModel: Model<VaultDocument>,
    @InjectModel(PasswordEntry.name) private passwordEntryModel: Model<PasswordEntryDocument>,
    private cryptoService: CryptoService,
    private strengthService: PasswordStrengthService,
  ) {}

  /**
   * Create a new vault for a user
   */
  async createVault(userId: string, masterPassword: string): Promise<VaultDocument> {
    // Check if vault already exists
    const existing = await this.vaultModel.findOne({ userId: new Types.ObjectId(userId) });
    if (existing) {
      throw new BadRequestException('Vault already exists for this user');
    }

    const masterPasswordHash = await this.cryptoService.hashMasterPassword(masterPassword);
    const salt = this.cryptoService.generateSalt();

    const vault = new this.vaultModel({
      userId: new Types.ObjectId(userId),
      masterPasswordHash,
      salt,
      lastUnlockedAt: new Date(),
    });

    return vault.save();
  }

  /**
   * Unlock vault with master password
   * Implements security rules: max attempts, temporary lock, paranoid wipe
   */
  async unlockVault(userId: string, masterPassword: string): Promise<{
    success: boolean;
    vault?: VaultDocument;
    salt?: string;
    message?: string;
  }> {
    const vault = await this.vaultModel.findOne({ userId: new Types.ObjectId(userId) });
    
    if (!vault) {
      throw new NotFoundException('Vault not found');
    }

    // Check if vault is locked
    if (vault.lockedUntil && vault.lockedUntil > new Date()) {
      const remainingTime = Math.ceil((vault.lockedUntil.getTime() - Date.now()) / 60000);
      throw new UnauthorizedException(
        `Vault is locked. Try again in ${remainingTime} minute(s)`,
      );
    }

    // Verify password
    const isValid = await this.cryptoService.verifyMasterPassword(
      masterPassword,
      vault.masterPasswordHash,
    );

    if (!isValid) {
      vault.failedUnlockAttempts += 1;

      // Paranoid mode: wipe data after threshold
      if (vault.paranoidMode && vault.failedUnlockAttempts >= this.PARANOID_WIPE_THRESHOLD) {
        await this.wipeVaultData(vault.id);
        throw new UnauthorizedException('Too many failed attempts. Vault data has been wiped for security.');
      }

      // Temporary lock after max attempts
      if (vault.failedUnlockAttempts >= this.MAX_UNLOCK_ATTEMPTS) {
        vault.lockedUntil = new Date(Date.now() + this.LOCK_DURATION_MS);
        await vault.save();
        throw new UnauthorizedException(
          `Too many failed attempts. Vault locked for ${this.LOCK_DURATION_MS / 60000} minutes`,
        );
      }

      await vault.save();
      return {
        success: false,
        message: `Invalid password. ${this.MAX_UNLOCK_ATTEMPTS - vault.failedUnlockAttempts} attempts remaining`,
      };
    }

    // Success: reset counters
    vault.failedUnlockAttempts = 0;
    vault.lockedUntil = null;
    vault.lastUnlockedAt = new Date();
    await vault.save();

    return {
      success: true,
      vault,
      salt: vault.salt,
    };
  }

  /**
   * Get vault by user ID
   */
  async getVaultByUserId(userId: string): Promise<VaultDocument> {
    const vault = await this.vaultModel.findOne({ userId: new Types.ObjectId(userId) });
    if (!vault) {
      throw new NotFoundException('Vault not found');
    }
    return vault;
  }

  /**
   * Update vault settings
   */
  async updateVaultSettings(
    vaultId: string,
    settings: {
      autoLockTimeout?: number;
      paranoidMode?: boolean;
      twoFactorEnabled?: boolean;
    },
  ): Promise<VaultDocument> {
    const vault = await this.vaultModel.findById(vaultId);
    if (!vault) {
      throw new NotFoundException('Vault not found');
    }

    if (settings.autoLockTimeout !== undefined) {
      vault.autoLockTimeout = settings.autoLockTimeout;
    }
    if (settings.paranoidMode !== undefined) {
      vault.paranoidMode = settings.paranoidMode;
    }
    if (settings.twoFactorEnabled !== undefined) {
      vault.twoFactorEnabled = settings.twoFactorEnabled;
    }

    return vault.save();
  }

  /**
   * Wipe all vault data (paranoid mode trigger)
   */
  private async wipeVaultData(vaultId: string): Promise<void> {
    await this.passwordEntryModel.deleteMany({ vaultId: new Types.ObjectId(vaultId) });
    await this.vaultModel.findByIdAndDelete(vaultId);
  }

  /**
   * Check if vault should auto-lock (based on lastUnlockedAt)
   */
  async checkAutoLock(vaultId: string): Promise<boolean> {
    const vault = await this.vaultModel.findById(vaultId);
    if (!vault) return true;

    const inactiveTime = Date.now() - vault.lastUnlockedAt.getTime();
    return inactiveTime > vault.autoLockTimeout;
  }
}
