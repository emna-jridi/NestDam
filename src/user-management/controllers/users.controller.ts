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
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiResponse,
  ApiParam,
  ApiUnauthorizedResponse,
  ApiNotFoundResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { UsersService } from '../services/users.service';
import { UpdateUserDto } from '../dto/update-user.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UpdateAvatarDto } from '../dto/update-avatar.dto';
import { BasicRoles } from '../enums/basic-roles.enum';
import { User } from '../entities/user.entity';
import { CreateUserDto } from '../dto/create-user.dto';
import { JwtPayload } from '../../auth/jwt.strategy';
import { UserResponseDto } from '../dto/user-response.dto';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('register')
  @ApiOperation({
    summary: 'Register a new user',
    description:
      'Creates a new user account. Password must be at least 6 characters long.',
  })
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
          password: 'password123',
        },
      },
      full: {
        summary: 'Full User Registration',
        value: {
          name: 'John',
          surname: 'Doe',
          email: 'user@example.com',
          password: 'password123',
          phone: '+1234567890',
          avatar: 'https://example.com/photo.jpg',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'User successfully registered',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error - invalid input data',
  })
  @ApiResponse({
    status: 409,
    description: 'Conflict - email already exists',
  })
  register(@Body() createUserDto: CreateUserDto): Promise<User> {
    return this.usersService.create(createUserDto, BasicRoles.User);
  }

  @Get('/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(BasicRoles.Admin)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get all users',
    description: 'Retrieves a list of all users. Admin access required.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of all users retrieved successfully',
    type: [UserResponseDto],
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - Invalid or missing token',
  })
  @ApiForbiddenResponse({ description: 'Forbidden - Admin role required' })
  findAll() {
    return this.usersService.findAll();
  }

  @Get('/me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get authenticated user profile',
    description:
      'Retrieves the profile of the currently authenticated user based on JWT token.',
  })
  @ApiResponse({
    status: 200,
    description: 'User profile retrieved successfully',
    type: UserResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - Invalid or missing token',
  })
  @ApiNotFoundResponse({ description: 'User not found' })
  async getProfile(@Req() req: Request & { user: JwtPayload }) {
    const userId = req.user.userId;
    return this.usersService.getProfile(userId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(BasicRoles.Admin)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get user by ID',
    description:
      'Retrieves detailed information about a specific user by their ID. Admin access required.',
  })
  @ApiParam({
    name: 'id',
    description: 'User ID',
    example: '64b8f9f3a6c4b2a1d0e1f234',
  })
  @ApiResponse({
    status: 200,
    description: 'User details retrieved successfully',
    type: UserResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - Invalid or missing token',
  })
  @ApiForbiddenResponse({ description: 'Forbidden - Admin role required' })
  @ApiNotFoundResponse({ description: 'User not found' })
  async getUserById(@Param('id') id: string): Promise<Partial<User>> {
    return this.usersService.getUserById(id);
  }

  @Patch('/profile/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update user profile',
    description:
      'Updates the profile information for a specific user. Only the authenticated user can update their own profile.',
  })
  @ApiParam({
    name: 'id',
    description: 'User ID',
    example: '64b8f9f3a6c4b2a1d0e1f234',
  })
  @ApiBody({
    type: UpdateUserDto,
    description: 'User profile update data',
    examples: {
      updateName: {
        summary: 'Update name',
        value: {
          name: 'Jane',
          surname: 'Smith',
        },
      },
      updatePhone: {
        summary: 'Update phone',
        value: {
          phone: '+9876543210',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'User profile updated successfully',
    type: UserResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - Invalid or missing token',
  })
  @ApiNotFoundResponse({ description: 'User not found' })
  async updateProfile(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<User | null> {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(BasicRoles.Admin)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Delete user',
    description: 'Deletes a user account. Admin access required.',
  })
  @ApiParam({
    name: 'id',
    description: 'User ID to delete',
    example: '64b8f9f3a6c4b2a1d0e1f234',
  })
  @ApiResponse({
    status: 200,
    description: 'User successfully deleted',
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - Invalid or missing token',
  })
  @ApiForbiddenResponse({ description: 'Forbidden - Admin role required' })
  @ApiNotFoundResponse({ description: 'User not found' })
  remove(@Param('id') id: string): Promise<void> {
    return this.usersService.remove(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('/:id/avatar')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update user avatar',
    description:
      'Updates the avatar URL for a specific user. Only the authenticated user can update their own avatar.',
  })
  @ApiParam({
    name: 'id',
    description: 'User ID',
    example: '64b8f9f3a6c4b2a1d0e1f234',
  })
  @ApiBody({
    type: UpdateAvatarDto,
    description: 'Avatar URL',
    examples: {
      updateAvatar: {
        summary: 'Update avatar',
        value: {
          avatar: 'https://example.com/new-avatar.jpg',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Avatar updated successfully',
    type: UserResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - Invalid or missing token',
  })
  @ApiNotFoundResponse({ description: 'User not found' })
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
