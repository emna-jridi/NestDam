import {
  Controller,
  Get,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Post,
  NotFoundException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';
import { UsersService } from '../services/users.service';
import { UpdateUserDto } from '../dto/update-user.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UpdateAvatarDto } from '../dto/update-avatar.dto';
import { BasicRoles } from '../enums/basic-roles.enum';
import { User } from '../entities/user.entity';
import { CreateUserDto } from '../dto/create-user.dto';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register new user ' })
  @ApiBody({
    type: CreateUserDto,
    description: 'User registration details',
    examples: {
      basic: {
        summary: 'Basic User Registration',
        value: {
          name: 'John',
          surname: 'Doe',
          email: 'user@example.com',
          password: 'password',
        },
      },
      full: {
        summary: 'Full User Registration',
        value: {
          email: 'user@example.com',
          password: 'password',
          name: 'John Doe',
          phone: '+1234567890',
          avatar: 'https://example.com/photo.jpg',
        },
      },
    },
  })
  register(@Body() createUserDto: CreateUserDto): Promise<User> {
    return this.usersService.create(createUserDto, BasicRoles.User);
  }

  @Get('/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(BasicRoles.Admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all users (Admin only - Web)' })
  findAll() {
    return this.usersService.findAll();
  }

  @Get('/profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my profile (Mobile App)' })
  getProfile(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch('/profile/:id')
  @UseGuards(JwtAuthGuard)
  async updateProfile(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<User | null> {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete user ' })
  remove(@Param('id') id: string): Promise<void> {
    return this.usersService.remove(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('/:id/avatar')
  @ApiBearerAuth()
  async updateAvatar(
    @Param('id') id: string,
    @Body() updateAvatarDto: UpdateAvatarDto,
  ) {
    const user = await this.usersService.findOne(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const { avatar } = updateAvatarDto;
    return this.usersService.updateAvatar(id, avatar);
  }
}
