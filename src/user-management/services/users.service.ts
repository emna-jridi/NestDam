import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../entities/user.entity';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import * as bcrypt from 'bcrypt';
import { BasicRoles } from '../enums/basic-roles.enum';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async create(
    createUserDto: CreateUserDto,
    role: BasicRoles.User,
  ): Promise<User> {
    const exists = await this.userModel.findOne({ email: createUserDto.email });
    if (exists) {
      throw new ConflictException('Email already exists');
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
    const avatarUrl = `https://api.dicebear.com/9.x/croodles/svg?seed=${encodeURIComponent(createUserDto.email)}`;

    const user = new this.userModel({
      ...createUserDto,
      password: hashedPassword,
      role,
      isDeviceRegistered: false,
      avatar: avatarUrl,
    });

    await user.save();
    return user;
  }

  async findAll(): Promise<User[]> {
    const users = await this.userModel.find().exec();
    return users;
  }

  async findOne(id: string): Promise<User> {
    const user = await this.userModel.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async findByEmail(email: string) {
    return this.userModel.findOne({ email }).exec();
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    return await this.userModel.findByIdAndUpdate(id, updateUserDto, {
      new: true,
    });
  }

  async remove(id: string) {
    await this.userModel.findByIdAndDelete(id);
  }

  async updateAvatar(userId: string, avatarUrl: string) {
    const user = await this.userModel.findByIdAndUpdate(
      userId,
      { avatar: avatarUrl },
      { new: true },
    );
    return user;
  }

  async updateRefreshToken(userId: string, refresh_token: string) {
    const hashedToken = await bcrypt.hash(refresh_token, 10);
    await this.userModel.findByIdAndUpdate(userId, {
      refreshToken: hashedToken,
    });
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

  async updateProfile(
    id: string,
    updateUserDto: UpdateUserDto,
  ): Promise<User | null> {
    return this.userModel.findByIdAndUpdate(id, updateUserDto, { new: true });
  }
}
