import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import * as argon2 from 'argon2';

/**
 * Cryptography service for ShadowVault
 * Implements Zero-Knowledge architecture:
 * - Client derives encryption keys from master password
 * - Server only stores Argon2id hash for verification
 * - Server NEVER has access to plaintext passwords or encryption keys
 */
@Injectable()
export class CryptoService {
  private readonly ALGORITHM = 'aes-256-gcm';
  private readonly IV_LENGTH = 16;
  private readonly AUTH_TAG_LENGTH = 16;
  private readonly SALT_LENGTH = 32;

  /**
   * Hash master password using Argon2id
   * This hash is ONLY for verification, never for encryption
   */
  async hashMasterPassword(masterPassword: string): Promise<string> {
    return argon2.hash(masterPassword, {
      type: argon2.argon2id,
      memoryCost: 65536, // 64 MB
      timeCost: 3,
      parallelism: 4,
    });
  }

  /**
   * Verify master password against stored hash
   */
  async verifyMasterPassword(
    masterPassword: string,
    hash: string,
  ): Promise<boolean> {
    try {
      return await argon2.verify(hash, masterPassword);
    } catch {
      return false;
    }
  }

  /**
   * Generate random salt for client-side key derivation
   * Client will use this with PBKDF2 to derive encryption key
   */
  generateSalt(): string {
    return crypto.randomBytes(this.SALT_LENGTH).toString('base64');
  }

  /**
   * Server-side encryption for backup data
   * Uses a server-managed key (NOT derived from master password)
   * This is for backup integrity, not zero-knowledge
   */
  encryptBackupData(data: string, backupKey: string): {
    encrypted: string;
    iv: string;
    authTag: string;
  } {
    const iv = crypto.randomBytes(this.IV_LENGTH);
    const key = crypto.scryptSync(backupKey, 'backup-salt', 32);
    
    const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);
    
    let encrypted = cipher.update(data, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    const authTag = cipher.getAuthTag().toString('base64');
    
    return {
      encrypted,
      iv: iv.toString('base64'),
      authTag,
    };
  }

  /**
   * Server-side decryption for backup data
   */
  decryptBackupData(
    encrypted: string,
    iv: string,
    authTag: string,
    backupKey: string,
  ): string {
    const key = crypto.scryptSync(backupKey, 'backup-salt', 32);
    
    const decipher = crypto.createDecipheriv(
      this.ALGORITHM,
      key,
      Buffer.from(iv, 'base64'),
    );
    
    decipher.setAuthTag(Buffer.from(authTag, 'base64'));
    
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  /**
   * Generate cryptographically secure random password
   */
  generateSecurePassword(length: number = 16): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
    const randomBytes = crypto.randomBytes(length);
    let password = '';
    
    for (let i = 0; i < length; i++) {
      password += charset[randomBytes[i] % charset.length];
    }
    
    return password;
  }

  /**
   * Generate memorable passphrase (4-6 words)
   */
  generatePassphrase(wordCount: number = 5): string {
    const words = [
      'apple', 'ocean', 'mountain', 'forest', 'river', 'thunder', 'crystal',
      'phoenix', 'dragon', 'galaxy', 'horizon', 'meadow', 'cascade', 'ember',
      'willow', 'aurora', 'comet', 'breeze', 'mystic', 'shadow', 'lunar',
      'solar', 'stellar', 'cosmic', 'nebula', 'quasar', 'vortex', 'zenith',
      'cipher', 'nexus', 'atlas', 'omega', 'alpha', 'delta', 'sigma', 'karma',
    ];
    
    const selected: string[] = [];
    for (let i = 0; i < wordCount; i++) {
      const randomIndex = crypto.randomInt(0, words.length);
      selected.push(words[randomIndex]);
    }
    
    return selected.join('-');
  }

  /**
   * Calculate SHA-256 hash for data integrity
   */
  calculateHash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }
}
