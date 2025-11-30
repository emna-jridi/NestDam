import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import axios from 'axios';
import { Model } from 'mongoose';
import path from 'path';
import { CreateAvatarDto } from './dto/create-avatar.dto';
import { UpdateAvatarDto } from './dto/update-avatar.dto';
import { Avatar } from './entities/avatar.schema';
import * as fs from 'fs';

@Injectable()
export class AvatarService {
  private readonly logger = new Logger(AvatarService.name);
  private readonly AVATAAARS_URL = 'https://avataaars.io/';
  private readonly UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'avatars');

  constructor(
    @InjectModel(Avatar.name) private avatarModel: Model<Avatar>,
  ) {
    this.ensureUploadDirExists();
  }

  private ensureUploadDirExists() {
    if (!fs.existsSync(this.UPLOAD_DIR)) {
      fs.mkdirSync(this.UPLOAD_DIR, { recursive: true });
      this.logger.log(`📁 Created upload directory: ${this.UPLOAD_DIR}`);
    }
  }

  /**
   * Générer une URL Avataaars
   */
  private generateAvataaarsUrl(config: any): string {
    const params = new URLSearchParams();
    Object.entries(config).forEach(([key, value]) => {
      if (value && key !== 'userHash') {
        params.append(key, value as string);
      }
    });
    return `${this.AVATAAARS_URL}?${params.toString()}`;
  }

  /**
   * Télécharger et sauvegarder l'avatar
   * ✅ Retourne uniquement le nom du fichier, pas l'URL
   */
  private async downloadAndSaveAvatar(
    userHash: string,
    config: any,
  ): Promise<{ fileName: string; localPath: string }> {
    try {
      const avataaarsUrl = this.generateAvataaarsUrl(config);
      const response = await axios.get(avataaarsUrl, {
        responseType: 'arraybuffer',
      });

      const timestamp = Date.now();
      const fileName = `${userHash}-${timestamp}.svg`;
      const localPath = path.join(this.UPLOAD_DIR, fileName);

      fs.writeFileSync(localPath, response.data);

      this.logger.log(`✅ Avatar saved: ${fileName}`);

      return {
        fileName,
        localPath,
      };
    } catch (error) {
      this.logger.error('❌ Error downloading avatar:', error.message);
      throw new Error('Failed to download and save avatar');
    }
  }

  /**
   * Supprimer un fichier avatar
   */
  private deleteAvatarFile(localPath: string) {
    try {
      if (fs.existsSync(localPath)) {
        fs.unlinkSync(localPath);
        this.logger.log(`🗑️ Deleted old avatar: ${localPath}`);
      }
    } catch (error) {
      this.logger.error('❌ Error deleting avatar file:', error.message);
    }
  }

  /**
   * Créer un nouvel avatar
   */
  async create(createAvatarDto: CreateAvatarDto) {
    const { userHash, ...config } = createAvatarDto;

    const existingAvatar = await this.avatarModel.findOne({ userHash });

    if (existingAvatar) {
      this.deleteAvatarFile(existingAvatar.localPath);
      return this.update(userHash, config);
    }

    // ✅ Télécharger et sauvegarder (retourne fileName uniquement)
    const { fileName, localPath } = await this.downloadAndSaveAvatar(
      userHash,
      config,
    );

    const avatar = new this.avatarModel({
      userHash,
      config,
      fileName,
      localPath,
    });

    await avatar.save();

    return {
      success: true,
      avatar: {
        userHash: avatar.userHash,
        config: avatar.config,
        fileName: avatar.fileName, // ✅ Retourner uniquement le nom du fichier
      },
    };
  }

  /**
   * Récupérer un avatar
   */
  async findByUserHash(userHash: string) {
    const avatar = await this.avatarModel.findOne({ userHash });

    if (!avatar) {
      throw new NotFoundException(`Avatar not found for user: ${userHash}`);
    }

    return {
      userHash: avatar.userHash,
      config: avatar.config,
      fileName: avatar.fileName, // ✅ Retourner uniquement le nom du fichier
      createdAt: avatar.createdAt,
      updatedAt: avatar.updatedAt,
    };
  }

  /**
   * Mettre à jour un avatar
   */
  async update(userHash: string, updateAvatarDto: UpdateAvatarDto) {
    const avatar = await this.avatarModel.findOne({ userHash });

    if (!avatar) {
      throw new NotFoundException(`Avatar not found for user: ${userHash}`);
    }

    const newConfig = {
      ...avatar.config,
      ...updateAvatarDto,
    };

    this.deleteAvatarFile(avatar.localPath);

    const { fileName, localPath } = await this.downloadAndSaveAvatar(
      userHash,
      newConfig,
    );

    avatar.config = newConfig;
    avatar.fileName = fileName;
    avatar.localPath = localPath;
    avatar.updatedAt = new Date();

    await avatar.save();

    return {
      success: true,
      avatar: {
        userHash: avatar.userHash,
        config: avatar.config,
        fileName: avatar.fileName, // ✅ Retourner uniquement le nom du fichier
      },
    };
  }

  /**
   * Supprimer un avatar
   */
  async remove(userHash: string) {
    const avatar = await this.avatarModel.findOne({ userHash });

    if (!avatar) {
      throw new NotFoundException(`Avatar not found for user: ${userHash}`);
    }

    this.deleteAvatarFile(avatar.localPath);
    await this.avatarModel.deleteOne({ userHash });

    return {
      success: true,
      message: `Avatar deleted for user: ${userHash}`,
    };
  }

  /**
   * Générer un avatar aléatoire
   */
  async generateRandom(userHash: string) {
    const config = {
      avatarStyle: this.randomChoice(['Circle', 'Transparent']),
      topType: this.randomChoice([
        'ShortHairShortFlat',
        'ShortHairShortRound',
        'LongHairStraight',
        'LongHairCurly',
        'Hijab',
        'Hat',
      ]),
      accessoriesType: this.randomChoice([
        'Blank',
        'Prescription02',
        'Sunglasses',
      ]),
      hairColor: this.randomChoice(['Black', 'Brown', 'Blonde', 'Red']),
      facialHairType: this.randomChoice(['Blank', 'BeardMedium', 'BeardLight']),
      clotheType: this.randomChoice(['Hoodie', 'ShirtCrewNeck', 'BlazerShirt']),
      clotheColor: this.randomChoice(['Black', 'Blue01', 'Red', 'Gray01']),
      eyeType: this.randomChoice(['Default', 'Happy', 'Squint']),
      eyebrowType: this.randomChoice(['Default', 'RaisedExcited']),
      mouthType: this.randomChoice(['Smile', 'Default', 'Twinkle']),
      skinColor: this.randomChoice(['Light', 'Tanned', 'Brown', 'DarkBrown']),
    };

    return this.create({ userHash, ...config });
  }

  /**
   * Générer un avatar cohérent
   */
  async generateConsistent(userHash: string) {
    const seed = this.hashToNumber(userHash);

    const config = {
      avatarStyle: 'Circle',
      topType: this.deterministicChoice(seed, 0, [
        'ShortHairShortFlat',
        'ShortHairShortRound',
        'LongHairStraight',
      ]),
      hairColor: this.deterministicChoice(seed, 1, ['Black', 'Brown', 'Blonde']),
      clotheType: this.deterministicChoice(seed, 2, ['Hoodie', 'ShirtCrewNeck']),
      clotheColor: this.deterministicChoice(seed, 3, ['Blue01', 'Red', 'Black']),
      eyeType: 'Default',
      mouthType: 'Smile',
      skinColor: this.deterministicChoice(seed, 4, ['Light', 'Tanned', 'Brown']),
    };

    return this.create({ userHash, ...config });
  }

  /**
   * Obtenir tous les avatars
   */
  async findAll(limit: number = 50) {
    const avatars = await this.avatarModel
      .find()
      .limit(limit)
      .sort({ updatedAt: -1 });

    return avatars.map((avatar) => ({
      userHash: avatar.userHash,
      fileName: avatar.fileName, // ✅ Retourner uniquement le nom du fichier
      updatedAt: avatar.updatedAt,
    }));
  }

  // Méthodes utilitaires privées
  private randomChoice<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
  }

  private hashToNumber(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash);
  }

  private deterministicChoice<T>(seed: number, offset: number, array: T[]): T {
    const index = (seed + offset * 1000) % array.length;
    return array[index];
  }
}