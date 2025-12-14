import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { VaultService } from '../services/vault.service';
import {
  CreateVaultDto,
  UnlockVaultDto,
  UpdateVaultSettingsDto,
  VaultUnlockResponseDto,
  VaultStatsDto,
} from '../dto/vault.dto';
import { VaultAiService } from '../services/vault-ai.service';
import { PasswordMetricsDto } from '../dto/password-metrics.dto';

@Controller('vault')
@UseGuards(JwtAuthGuard)
export class VaultController {
  constructor(
    private readonly vaultService: VaultService,
    private readonly vaultAiService: VaultAiService,
  ) { }

  /**
   * POST /vault - Create a new vault
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createVault(@Request() req, @Body() dto: CreateVaultDto) {
    const userId = req.user.userId || req.user.sub;
    const vault = await this.vaultService.createVault(userId, dto.masterPassword);

    return {
      message: 'Vault created successfully',
      vaultId: vault.id,
      salt: vault.salt,
    };
  }

  /**
   * POST /vault/unlock - Unlock vault with master password
   */
  @Post('unlock')
  @HttpCode(HttpStatus.OK)
  async unlockVault(
    @Request() req,
    @Body() dto: UnlockVaultDto,
  ): Promise<VaultUnlockResponseDto> {
    const userId = req.user.userId || req.user.sub;
    const result = await this.vaultService.unlockVault(userId, dto.masterPassword);

    return {
      success: result.success,
      salt: result.salt,
      vaultId: result.vault?.id,
      message: result.message,
    };
  }

  /**
   * GET /vault - Get user's vault info (non-sensitive)
   */
  @Get()
  async getVault(@Request() req) {
    const userId = req.user.userId || req.user.sub;
    const vault = await this.vaultService.getVaultByUserId(userId);

    return {
      vaultId: vault.id,
      autoLockTimeout: vault.autoLockTimeout,
      paranoidMode: vault.paranoidMode,
      twoFactorEnabled: vault.twoFactorEnabled,
      lastUnlockedAt: vault.lastUnlockedAt,
      failedUnlockAttempts: vault.failedUnlockAttempts,
      isLocked: vault.lockedUntil && vault.lockedUntil > new Date(),
    };
  }

  /**
   * PUT /vault/settings - Update vault security settings
   */
  @Put('settings')
  async updateSettings(@Request() req, @Body() dto: UpdateVaultSettingsDto) {
    const userId = req.user.userId || req.user.sub;
    const vault = await this.vaultService.getVaultByUserId(userId);
    const updated = await this.vaultService.updateVaultSettings(vault.id, dto);

    return {
      message: 'Settings updated successfully',
      autoLockTimeout: updated.autoLockTimeout,
      paranoidMode: updated.paranoidMode,
      twoFactorEnabled: updated.twoFactorEnabled,
    };
  }

  /**
   * GET /vault/check-lock - Check if vault should be auto-locked
   */
  @Get('check-lock')
  async checkAutoLock(@Request() req) {
    const userId = req.user.userId || req.user.sub;
    const vault = await this.vaultService.getVaultByUserId(userId);
    const shouldLock = await this.vaultService.checkAutoLock(vault.id);

    return {
      shouldLock,
      lastUnlockedAt: vault.lastUnlockedAt,
      autoLockTimeout: vault.autoLockTimeout,
    };
  }

  /**
   * POST /vault/ai-analyze - Analyze password strength via AI (Zero Knowledge)
   */
  @Post('ai-analyze')
  async analyzePassword(@Body() metrics: PasswordMetricsDto) {
    return this.vaultAiService.analyze(metrics);
  }
}
