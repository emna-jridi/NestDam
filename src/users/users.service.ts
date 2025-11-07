import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async create(createUserDto: CreateUserDto, role: string = 'user') {
    const exists = await this.userModel.findOne({ email: createUserDto.email });
    if (exists) {
      throw new ConflictException('Email already exists');
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
    const avatarUrl = `https://avatars.dicebear.com/api/croodles/${encodeURIComponent(createUserDto.email)}.svg`;

    const user = new this.userModel({
      ...createUserDto,
      password: hashedPassword,
      role,
      avatar: avatarUrl,

    });

    await user.save();
    return this.sanitizeUser(user);
  }

  async findAll() {
    const users = await this.userModel.find().exec();
    return users.map(user => this.sanitizeUser(user));
  }

  async findOne(id: string) {
    const user = await this.userModel.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.sanitizeUser(user);
  }

  async findByEmail(email: string) {
    return this.userModel.findOne({ email }).exec();
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const user = await this.userModel.findByIdAndUpdate(
      id,
      updateUserDto,
      { new: true }
    );
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.sanitizeUser(user);
  }

  async remove(id: string) {
    const result = await this.userModel.findByIdAndDelete(id);
    if (!result) {
      throw new NotFoundException('User not found');
    }
  }
async updateAvatar(userId: string, avatarUrl: string) {
  console.log('Updating avatar for userId:', userId);

  const user = await this.userModel.findByIdAndUpdate(
    userId,
    { avatar: avatarUrl },
    { new: true },
  );
  console.log(user)

  if (!user) throw new NotFoundException('User not found');
  return this.sanitizeUser(user);
}

  async updateRefreshToken(userId: string, refreshToken: string) {
    const hashedToken = await bcrypt.hash(refreshToken, 10);
    await this.userModel.findByIdAndUpdate(userId, { refreshToken: hashedToken });
  }

 

  async resetPassword(resetCode: string, newPassword: string) {
    const user = await this.userModel.findOne({
      resetPasswordCode: resetCode,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!user) {
      throw new NotFoundException('Invalid or expired reset code');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.userModel.findByIdAndUpdate(user._id, {
      password: hashedPassword,
      resetPasswordCode: null,
      resetPasswordExpires: null,
    });
  }

  // Supprime les champs sensibles (mot de passe, token) avant de renvoyer l'utilisateur  
  private sanitizeUser(user: any) {
    const obj = user.toObject();
    delete obj.password;
    delete obj.refreshToken;
    return obj;
  }
}
