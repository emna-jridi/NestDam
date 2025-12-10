// src/modules/avatar/avatar.controller.ts

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { AvatarService } from './avatar.service';
import { CreateAvatarDto } from './dto/create-avatar.dto';
import { UpdateAvatarDto } from './dto/update-avatar.dto';

@ApiTags('avatar')
@Controller('api/v1/avatar')
export class AvatarController {
  constructor(private readonly avatarService: AvatarService) {}

  /**
   * Créer un avatar personnalisé
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Créer un avatar personnalisé',
    description: 'Crée un nouvel avatar avec une configuration personnalisée pour un utilisateur',
  })
  @ApiBody({
    type: CreateAvatarDto,
    description: 'Configuration de l\'avatar',
    examples: {
      exemple1: {
        summary: 'Avatar professionnel',
        value: {
          userHash: 'user123',
          avatarStyle: 'Circle',
          topType: 'ShortHairShortFlat',
          hairColor: 'Black',
          clotheType: 'BlazerShirt',
          clotheColor: 'Gray01',
          skinColor: 'Light',
          eyeType: 'Default',
          mouthType: 'Smile',
        },
      },
      exemple2: {
        summary: 'Avatar décontracté',
        value: {
          userHash: 'user456',
          avatarStyle: 'Circle',
          topType: 'LongHairCurly',
          hairColor: 'Brown',
          clotheType: 'Hoodie',
          clotheColor: 'Blue01',
          skinColor: 'Tanned',
          eyeType: 'Happy',
          mouthType: 'Smile',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Avatar créé avec succès',
    schema: {
      example: {
        success: true,
        avatar: {
          userHash: 'user123',
          config: {
            avatarStyle: 'Circle',
            topType: 'ShortHairShortFlat',
            hairColor: 'Black',
          },
          url: 'http://localhost:3000/uploads/avatars/user123-1700000000000.svg',
          fileName: 'user123-1700000000000.svg',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Données invalides',
  })
  create(@Body() createAvatarDto: CreateAvatarDto) {
    return this.avatarService.create(createAvatarDto);
  }

  /**
   * Récupérer l'avatar d'un utilisateur
   */
  @Get(':userHash')
  @ApiOperation({
    summary: 'Récupérer l\'avatar d\'un utilisateur',
    description: 'Obtient l\'avatar et sa configuration pour un utilisateur spécifique',
  })
  @ApiParam({
    name: 'userHash',
    description: 'Hash unique de l\'utilisateur',
    example: 'user123',
  })
  @ApiResponse({
    status: 200,
    description: 'Avatar trouvé',
    schema: {
      example: {
        userHash: 'user123',
        config: {
          avatarStyle: 'Circle',
          topType: 'ShortHairShortFlat',
          hairColor: 'Black',
        },
        url: 'http://localhost:3000/uploads/avatars/user123-1700000000000.svg',
        fileName: 'user123-1700000000000.svg',
        createdAt: '2024-01-15T10:30:00.000Z',
        updatedAt: '2024-01-15T10:30:00.000Z',
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Avatar non trouvé',
  })
  findOne(@Param('userHash') userHash: string) {
    return this.avatarService.findByUserHash(userHash);
  }

  /**
   * Mettre à jour l'avatar d'un utilisateur
   */
  @Put(':userHash')
  @ApiOperation({
    summary: 'Mettre à jour l\'avatar',
    description: 'Modifie la configuration de l\'avatar d\'un utilisateur existant',
  })
  @ApiParam({
    name: 'userHash',
    description: 'Hash unique de l\'utilisateur',
    example: 'user123',
  })
  @ApiBody({
    type: UpdateAvatarDto,
    description: 'Nouvelles propriétés de l\'avatar (partielles)',
    examples: {
      changementCouleur: {
        summary: 'Changer la couleur des cheveux',
        value: {
          hairColor: 'Blonde',
        },
      },
      changementComplet: {
        summary: 'Changer plusieurs éléments',
        value: {
          topType: 'LongHairStraight',
          hairColor: 'Red',
          clotheColor: 'Black',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Avatar mis à jour avec succès',
  })
  @ApiResponse({
    status: 404,
    description: 'Avatar non trouvé',
  })
  update(
    @Param('userHash') userHash: string,
    @Body() updateAvatarDto: UpdateAvatarDto,
  ) {
    return this.avatarService.update(userHash, updateAvatarDto);
  }

  /**
   * Supprimer l'avatar d'un utilisateur
   */
  @Delete(':userHash')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Supprimer un avatar',
    description: 'Supprime l\'avatar d\'un utilisateur et le fichier associé',
  })
  @ApiParam({
    name: 'userHash',
    description: 'Hash unique de l\'utilisateur',
    example: 'user123',
  })
  @ApiResponse({
    status: 204,
    description: 'Avatar supprimé avec succès',
  })
  @ApiResponse({
    status: 404,
    description: 'Avatar non trouvé',
  })
  remove(@Param('userHash') userHash: string) {
    return this.avatarService.remove(userHash);
  }

  /**
   * Générer un avatar aléatoire
   */
  @Post('random/:userHash')
  @ApiOperation({
    summary: 'Générer un avatar aléatoire',
    description: 'Crée un avatar avec une configuration totalement aléatoire',
  })
  @ApiParam({
    name: 'userHash',
    description: 'Hash unique de l\'utilisateur',
    example: 'user123',
  })
  @ApiResponse({
    status: 201,
    description: 'Avatar aléatoire généré',
    schema: {
      example: {
        success: true,
        avatar: {
          userHash: 'user123',
          config: {
            avatarStyle: 'Circle',
            topType: 'LongHairCurly',
            hairColor: 'Brown',
            clotheType: 'Hoodie',
            clotheColor: 'Red',
            skinColor: 'Tanned',
          },
          url: 'http://localhost:3000/uploads/avatars/user123-1700000000000.svg',
          fileName: 'user123-1700000000000.svg',
        },
      },
    },
  })
  generateRandom(@Param('userHash') userHash: string) {
    return this.avatarService.generateRandom(userHash);
  }

  /**
   * Générer un avatar cohérent
   */
  @Post('consistent/:userHash')
  @ApiOperation({
    summary: 'Générer un avatar cohérent',
    description: 'Génère un avatar déterministe basé sur le userHash (toujours le même résultat pour le même user)',
  })
  @ApiParam({
    name: 'userHash',
    description: 'Hash unique de l\'utilisateur',
    example: 'user123',
  })
  @ApiResponse({
    status: 201,
    description: 'Avatar cohérent généré',
    schema: {
      example: {
        success: true,
        avatar: {
          userHash: 'user123',
          config: {
            avatarStyle: 'Circle',
            topType: 'ShortHairShortFlat',
            hairColor: 'Black',
            clotheType: 'Hoodie',
            clotheColor: 'Blue01',
            skinColor: 'Light',
          },
          url: 'http://localhost:3000/uploads/avatars/user123-1700000000000.svg',
          fileName: 'user123-1700000000000.svg',
        },
      },
    },
  })
  generateConsistent(@Param('userHash') userHash: string) {
    return this.avatarService.generateConsistent(userHash);
  }

  /**
   * Obtenir tous les avatars (Admin)
   */
  @Get()
  @ApiOperation({
    summary: 'Lister tous les avatars',
    description: 'Récupère la liste de tous les avatars (pour administration)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Nombre maximum d\'avatars à retourner',
    example: 50,
  })
  @ApiResponse({
    status: 200,
    description: 'Liste des avatars',
    schema: {
      example: [
        {
          userHash: 'user123',
          url: 'http://localhost:3000/uploads/avatars/user123-1700000000000.svg',
          fileName: 'user123-1700000000000.svg',
          updatedAt: '2024-01-15T10:30:00.000Z',
        },
        {
          userHash: 'user456',
          url: 'http://localhost:3000/uploads/avatars/user456-1700000001000.svg',
          fileName: 'user456-1700000001000.svg',
          updatedAt: '2024-01-15T11:45:00.000Z',
        },
      ],
    },
  })
  findAll(@Query('limit') limit?: number) {
    return this.avatarService.findAll(limit);
  }
}