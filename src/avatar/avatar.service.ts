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
  private readonly BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

  constructor(
    @InjectModel(Avatar.name) private avatarModel: Model<Avatar>,
  ) {
    // Créer le dossier uploads/avatars s'il n'existe pas
    this.ensureUploadDirExists();
  }


  private ensureUploadDirExists() {
    if (!fs.existsSync(this.UPLOAD_DIR)) {
      fs.mkdirSync(this.UPLOAD_DIR, { recursive: true });
      this.logger.log(` Created upload directory: ${this.UPLOAD_DIR}`);
    }
  }

  /**
   * Générer une URL Avataaars à partir d'une config
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
   * Télécharger le SVG depuis Avataaars et le sauvegarder localement
   */
  private async downloadAndSaveAvatar(
    userHash: string,
    config: any,
  ): Promise<{ fileName: string; localPath: string; publicUrl: string }> {
    try {
      // Générer l'URL Avataaars
      const avataaarsUrl = this.generateAvataaarsUrl(config);

      // Télécharger le SVG
      const response = await axios.get(avataaarsUrl, {
        responseType: 'arraybuffer',
      });

      // Générer un nom de fichier unique
      const timestamp = Date.now();
      const fileName = `${userHash}-${timestamp}.svg`;
      const localPath = path.join(this.UPLOAD_DIR, fileName);
      const publicUrl = `${this.BASE_URL}/uploads/avatars/${fileName}`;

      // Sauvegarder le fichier
      fs.writeFileSync(localPath, response.data);

      this.logger.log(` Avatar saved: ${fileName}`);

      return {
        fileName,
        localPath,
        publicUrl,
      };
    } catch (error) {
      this.logger.error(' Error downloading avatar:', error.message);
      throw new Error('Failed to download and save avatar');
    }
  }

  /**
   * Supprimer l'ancien fichier avatar
   */
  private deleteAvatarFile(localPath: string) {
    try {
      if (fs.existsSync(localPath)) {
        fs.unlinkSync(localPath);
        this.logger.log(` Deleted old avatar: ${localPath}`);
      }
    } catch (error) {
      this.logger.error(' Error deleting avatar file:', error.message);
    }
  }

  /**
   * Créer un nouvel avatar
   */
  async create(createAvatarDto: CreateAvatarDto) {
    const { userHash, ...config } = createAvatarDto;

    // Vérifier si l'utilisateur a déjà un avatar
    const existingAvatar = await this.avatarModel.findOne({ userHash });

    if (existingAvatar) {
      // Supprimer l'ancien fichier
      this.deleteAvatarFile(existingAvatar.localPath);

      // Mettre à jour avec le nouveau
      return this.update(userHash, config);
    }

    // Télécharger et sauvegarder l'avatar
    const { fileName, localPath, publicUrl } = await this.downloadAndSaveAvatar(
      userHash,
      config,
    );

    // Créer l'entrée en base de données
    const avatar = new this.avatarModel({
      userHash,
      config,
      fileName,
      localPath,
      publicUrl,
    });

    await avatar.save();

    return {
      success: true,
      avatar: {
        userHash: avatar.userHash,
        config: avatar.config,
        url: avatar.publicUrl,
        fileName: avatar.fileName,
      },
    };
  }

  /**
   * Récupérer l'avatar d'un utilisateur
   */
  async findByUserHash(userHash: string) {
    const avatar = await this.avatarModel.findOne({ userHash });

    if (!avatar) {
      throw new NotFoundException(`Avatar not found for user: ${userHash}`);
    }

    return {
      userHash: avatar.userHash,
      config: avatar.config,
      url: avatar.publicUrl,
      fileName: avatar.fileName,
      createdAt: avatar.createdAt,
      updatedAt: avatar.updatedAt,
    };
  }

  /**
   * Mettre à jour l'avatar d'un utilisateur
   */
  async update(userHash: string, updateAvatarDto: UpdateAvatarDto) {
    const avatar = await this.avatarModel.findOne({ userHash });

    if (!avatar) {
      throw new NotFoundException(`Avatar not found for user: ${userHash}`);
    }

    // Fusionner l'ancienne config avec la nouvelle
    const newConfig = {
      ...avatar.config,
      ...updateAvatarDto,
    };

    // Supprimer l'ancien fichier
    this.deleteAvatarFile(avatar.localPath);

    // Télécharger et sauvegarder le nouveau
    const { fileName, localPath, publicUrl } = await this.downloadAndSaveAvatar(
      userHash,
      newConfig,
    );

    // Mettre à jour en base
    avatar.config = newConfig;
    avatar.fileName = fileName;
    avatar.localPath = localPath;
    avatar.publicUrl = publicUrl;
    avatar.updatedAt = new Date();

    await avatar.save();

    return {
      success: true,
      avatar: {
        userHash: avatar.userHash,
        config: avatar.config,
        url: avatar.publicUrl,
        fileName: avatar.fileName,
      },
    };
  }

  /**
   * Supprimer l'avatar d'un utilisateur
   */
  async remove(userHash: string) {
    const avatar = await this.avatarModel.findOne({ userHash });

    if (!avatar) {
      throw new NotFoundException(`Avatar not found for user: ${userHash}`);
    }

    // Supprimer le fichier
    this.deleteAvatarFile(avatar.localPath);

    // Supprimer de la base
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
        'ShortHairShortWaved',
        'LongHairStraight',
        'LongHairCurly',
        'Hijab',
        'Hat',
      ]),
      accessoriesType: this.randomChoice([
        'Blank',
        'Prescription02',
        'Sunglasses',
        'Wayfarers',
      ]),
      hairColor: this.randomChoice([
        'Black',
        'Brown',
        'BrownDark',
        'Blonde',
        'Red',
      ]),
      facialHairType: this.randomChoice([
        'Blank',
        'BeardMedium',
        'BeardLight',
      ]),
      clotheType: this.randomChoice([
        'Hoodie',
        'ShirtCrewNeck',
        'BlazerShirt',
      ]),
      clotheColor: this.randomChoice([
        'Black',
        'Blue01',
        'Red',
        'Gray01',
      ]),
      eyeType: this.randomChoice(['Default', 'Happy', 'Squint']),
      eyebrowType: this.randomChoice(['Default', 'RaisedExcited']),
      mouthType: this.randomChoice(['Smile', 'Default', 'Twinkle']),
      skinColor: this.randomChoice(['Light', 'Tanned', 'Brown', 'DarkBrown']),
    };

    return this.create({ userHash, ...config });
  }

  /**
   * Générer un avatar cohérent basé sur le userHash
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
      hairColor: this.deterministicChoice(seed, 1, [
        'Black',
        'Brown',
        'Blonde',
      ]),
      clotheType: this.deterministicChoice(seed, 2, ['Hoodie', 'ShirtCrewNeck']),
      clotheColor: this.deterministicChoice(seed, 3, ['Blue01', 'Red', 'Black']),
      eyeType: 'Default',
      mouthType: 'Smile',
      skinColor: this.deterministicChoice(seed, 4, ['Light', 'Tanned', 'Brown']),
    };

    return this.create({ userHash, ...config });
  }

  /**
   * Obtenir tous les avatars (pour admin)
   */
  async findAll(limit: number = 50) {
    const avatars = await this.avatarModel
      .find()
      .limit(limit)
      .sort({ updatedAt: -1 });

    return avatars.map((avatar) => ({
      userHash: avatar.userHash,
      url: avatar.publicUrl,
      fileName: avatar.fileName,
      updatedAt: avatar.updatedAt,
    }));
  }

  // ========================================
  // Méthodes utilitaires privées
  // ========================================

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
