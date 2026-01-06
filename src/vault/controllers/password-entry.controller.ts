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
import { PasswordEntryService } from '../services/password-entry.service';
import { VaultService } from '../services/vault.service';
import {
  CreatePasswordEntryDto,
  UpdatePasswordEntryDto,
  PasswordEntryResponseDto,
  AnalyzePasswordDto,
  PasswordStrengthResponseDto,
} from '../dto/password-entry.dto';

@Controller('vault/passwords')
@UseGuards(JwtAuthGuard)
export class PasswordEntryController {
  constructor(
    private readonly passwordEntryService: PasswordEntryService,
    private readonly vaultService: VaultService,
  ) { }

  /**
   * POST /vault/passwords - Create a new password entry
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Request() req, @Body() dto: CreatePasswordEntryDto) {
    const userId = req.user.userId || req.user.sub;
    const vault = await this.vaultService.getVaultByUserId(userId);

    const entry = await this.passwordEntryService.create(
      vault.id,
      userId,
      dto,
    );

    return {
      message: 'Password entry created successfully',
      entry: this.mapToResponse(entry),
    };
  }

  /**
   * GET /vault/passwords - Get all password entries
   */
  @Get()
  async findAll(@Request() req, @Query('category') category?: string) {
    const userId = req.user.userId || req.user.sub;
    const vault = await this.vaultService.getVaultByUserId(userId);

    const entries = category
      ? await this.passwordEntryService.findByCategory(vault.id, userId, category)
      : await this.passwordEntryService.findAll(vault.id, userId);

    return {
      count: entries.length,
      entries: entries.map(e => this.mapToResponse(e)),
    };
  }

  /**
   * GET /vault/passwords/search - Search password entries
   */
  @Get('search')
  async search(@Request() req, @Query('q') query: string) {
    if (!query) {
      return { count: 0, entries: [] };
    }

    const userId = req.user.userId || req.user.sub;
    const vault = await this.vaultService.getVaultByUserId(userId);
    const entries = await this.passwordEntryService.search(
      vault.id,
      userId,
      query,
    );

    return {
      count: entries.length,
      entries: entries.map(e => this.mapToResponse(e)),
    };
  }

  /**
   * GET /vault/passwords/:id - Get a single password entry
   */
  @Get(':id')
  async findOne(@Request() req, @Param('id') id: string) {
    const userId = req.user.userId || req.user.sub;
    const entry = await this.passwordEntryService.findOne(id, userId);

    return {
      entry: this.mapToResponse(entry),
    };
  }

  /**
   * PUT /vault/passwords/:id - Update a password entry
   */
  @Put(':id')
  async update(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdatePasswordEntryDto,
  ) {
    const userId = req.user.userId || req.user.sub;
    const entry = await this.passwordEntryService.update(id, userId, dto);

    return {
      message: 'Password entry updated successfully',
      entry: this.mapToResponse(entry),
    };
  }

  /**
   * DELETE /vault/passwords/:id - Delete a password entry
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Request() req, @Param('id') id: string) {
    const userId = req.user.userId || req.user.sub;
    await this.passwordEntryService.delete(id, userId);
  }

  /**
   * POST /vault/passwords/:id/favorite - Toggle favorite status
   */
  @Post(':id/favorite')
  async toggleFavorite(@Request() req, @Param('id') id: string) {
    const userId = req.user.userId || req.user.sub;
    const entry = await this.passwordEntryService.toggleFavorite(id, userId);

    return {
      message: entry.isFavorite ? 'Added to favorites' : 'Removed from favorites',
      entry: this.mapToResponse(entry),
    };
  }

  /**
   * POST /vault/passwords/analyze - Analyze password strength
   * Note: Receives plaintext password ONLY for analysis, never stored
   */
  @Post('analyze')
  @HttpCode(HttpStatus.OK)
  async analyzeStrength(@Body() dto: AnalyzePasswordDto): Promise<PasswordStrengthResponseDto> {
    // This is a stateless analysis - no entry ID needed
    const result = await this.passwordEntryService['strengthService'].analyzePassword(dto.password);
    const recommendations = await this.passwordEntryService['strengthService'].generateRecommendations(
      dto.password,
      result,
    );

    return {
      score: result.score,
      level: result.level,
      crackTime: result.crackTime,
      issues: result.issues,
      recommendations,
    };
  }

  /**
   * POST /vault/passwords/:id/analyze - Analyze and update existing entry
   */
  @Post(':id/analyze')
  async analyzeAndUpdate(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: AnalyzePasswordDto,
  ): Promise<PasswordStrengthResponseDto> {
    const result = await this.passwordEntryService.analyzePasswordStrength(id, dto.password);
    return result;
  }

  /**
   * Map document to response DTO
   */
  private mapToResponse(entry: any): PasswordEntryResponseDto {
    return {
      id: entry._id.toString(),
      site: entry.site,
      username: entry.username,
      encryptedPassword: entry.encryptedPassword,
      encryptedNotes: entry.encryptedNotes,
      url: entry.url,
      category: entry.category,
      tags: entry.tags,
      isFavorite: entry.isFavorite,
      strengthScore: entry.strengthScore,
      strengthLevel: entry.strengthLevel,
      estimatedCrackTime: entry.estimatedCrackTime,
      strengthIssues: entry.strengthIssues,
      aiRecommendations: entry.aiRecommendations,
      lastPasswordChange: entry.lastPasswordChange,
      lastAccessed: entry.lastAccessed,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    };
  }
}
