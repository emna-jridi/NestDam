import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PasswordEntry, PasswordEntryDocument } from '../schemas/password-entry.schema';
import { CreatePasswordEntryDto, UpdatePasswordEntryDto } from '../dto/password-entry.dto';

/**
 * Service for managing password entries
 * Note: Passwords are encrypted CLIENT-SIDE before being sent to server
 */
@Injectable()
export class PasswordEntryService {
  constructor(
    @InjectModel(PasswordEntry.name) private passwordEntryModel: Model<PasswordEntryDocument>,
  ) {}

  /**
   * Create a new password entry
   * Password must already be encrypted by client
   */
  async create(
    vaultId: string,
    userId: string,
    dto: CreatePasswordEntryDto,
  ): Promise<PasswordEntryDocument> {
    const entry = new this.passwordEntryModel({
      vaultId: new Types.ObjectId(vaultId),
      userId: new Types.ObjectId(userId),
      ...dto,
      lastPasswordChange: new Date(),
      lastAccessed: new Date(),
    });

    return entry.save();
  }

  /**
   * Get all password entries for a vault
   */
  async findAll(vaultId: string, userId: string): Promise<PasswordEntryDocument[]> {
    return this.passwordEntryModel
      .find({
        vaultId: new Types.ObjectId(vaultId),
        userId: new Types.ObjectId(userId),
      })
      .sort({ isFavorite: -1, createdAt: -1 })
      .exec();
  }

  /**
   * Get a single password entry by ID
   */
  async findOne(id: string, userId: string): Promise<PasswordEntryDocument> {
    const entry = await this.passwordEntryModel.findOne({
      _id: new Types.ObjectId(id),
      userId: new Types.ObjectId(userId),
    });

    if (!entry) {
      throw new NotFoundException('Password entry not found');
    }

    // Update last accessed
    entry.lastAccessed = new Date();
    await entry.save();

    return entry;
  }

  /**
   * Update a password entry
   */
  async update(
    id: string,
    userId: string,
    dto: UpdatePasswordEntryDto,
  ): Promise<PasswordEntryDocument> {
    const entry = await this.passwordEntryModel.findOne({
      _id: new Types.ObjectId(id),
      userId: new Types.ObjectId(userId),
    });

    if (!entry) {
      throw new NotFoundException('Password entry not found');
    }

    Object.assign(entry, dto);

    if (dto.encryptedPassword) {
      entry.lastPasswordChange = new Date();
    }

    return entry.save();
  }

  /**
   * Delete a password entry
   */
  async delete(id: string, userId: string): Promise<void> {
    const result = await this.passwordEntryModel.deleteOne({
      _id: new Types.ObjectId(id),
      userId: new Types.ObjectId(userId),
    });

    if (result.deletedCount === 0) {
      throw new NotFoundException('Password entry not found');
    }
  }

  /**
   * Toggle favorite status
   */
  async toggleFavorite(id: string, userId: string): Promise<PasswordEntryDocument> {
    const entry = await this.findOne(id, userId);
    entry.isFavorite = !entry.isFavorite;
    return entry.save();
  }

  /**
   * Search password entries
   */
  async search(vaultId: string, userId: string, query: string): Promise<PasswordEntryDocument[]> {
    return this.passwordEntryModel
      .find({
        vaultId: new Types.ObjectId(vaultId),
        userId: new Types.ObjectId(userId),
        $or: [
          { site: { $regex: query, $options: 'i' } },
          { username: { $regex: query, $options: 'i' } },
          { url: { $regex: query, $options: 'i' } },
        ],
      })
      .sort({ isFavorite: -1, createdAt: -1 })
      .exec();
  }

  /**
   * Get entries by category
   */
  async findByCategory(
    vaultId: string,
    userId: string,
    category: string,
  ): Promise<PasswordEntryDocument[]> {
    return this.passwordEntryModel
      .find({
        vaultId: new Types.ObjectId(vaultId),
        userId: new Types.ObjectId(userId),
        category,
      })
      .sort({ isFavorite: -1, createdAt: -1 })
      .exec();
  }
}
