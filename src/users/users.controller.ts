import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request, NotFoundException, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UpdateAvatarDto } from './dto/update-avatar.dto';
@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) { }


  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all users (Admin only - Web)' })
  findAll() {
    return this.usersService.findAll();
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my profile (Mobile App)' })
  getProfile(@Request() req) {

    return this.usersService.findOne(req.user.userId);
  }

@Patch('me')
@UseGuards(JwtAuthGuard) // ou votre guard d'authentification
async updateProfile(@Req() req, @Body() updateUserDto: UpdateUserDto) {
  const userId = req.user.userId;
  console.log('🔄 Demande de mise à jour pour:', req.user.id);
  console.log('📨 Données reçues:', updateUserDto);
  
  return this.usersService.update(userId, updateUserDto);
}

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete user ' })
  remove(@Param('id') id: string) {
    this.usersService.remove(id);
    return { message: 'User deleted' };
  }
  
}