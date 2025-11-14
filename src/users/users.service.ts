import { Injectable, NotFoundException, ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { MailService } from '../mail/mail.service'
import { addMinutes } from 'date-fns';
import { VerifyOtpDto } from 'src/auth/dto/verify-otp.dto';
import { ResendOtpDto } from 'src/auth/dto/resend-otp.dto';
import { AvatarService } from 'src/avatar/avatar.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly mailService: MailService,
    private avatarService: AvatarService,

  ) { }

  private generateNumericOtp(length = 6): string {
    // secure numeric OTP
    const max = 10 ** length;
    const num = crypto.randomInt(0, max).toString().padStart(length, '0');
    return num;
  }
  async create(createUserDto: CreateUserDto, role: string = 'user') {
    const exists = await this.userModel.findOne({ email: createUserDto.email });
    if (exists) {
      throw new ConflictException('Email already exists');
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
    const userHash = this.generateUserHash(createUserDto.email);

    const otp = this.generateNumericOtp(6);
    const otpHash = await bcrypt.hash(otp, 10);
    const otpExpires = addMinutes(new Date(), 10); // 10 minutes validity
    const user = new this.userModel({
      ...createUserDto,
      password: hashedPassword,
      role: 'user',
      otpHash: otpHash,
      otpExpires,
      isVerified: false,

    });

    await user.save();
    await this.mailService.sendOtpEmail(user.email, user.name, otp);
    try {
      const avatarResult = await this.avatarService.generateRandom(userHash);

      // 6. Mettre à jour l'utilisateur avec l'avatar
      user.avatarUrl = avatarResult.avatar.url;
      await user.save();

      console.log(`✅ Avatar créé pour l'utilisateur ${user.email}`);
    } catch (error) {
      console.error('⚠️ Erreur lors de la création de l\'avatar:', error.message);
      // On continue même si l'avatar échoue
    }
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
  async findByUserHash(userHash: string) {
    return this.userModel.findOne({ userHash });
  }

  async findByEmail(email: string) {
    return this.userModel.findOne({ email }).exec();
  }
  async update(id: string, updateUserDto: UpdateUserDto) {
    // Construire l'objet de mise à jour dynamiquement
    const updateData: any = {};

    // Ajouter seulement les champs présents dans le DTO
    if (updateUserDto.name !== undefined) updateData.name = updateUserDto.name;
    const user = await this.userModel.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    );

    if (!user) {
      throw new NotFoundException('User not found');
    }

    console.log('✅ Utilisateur mis à jour:', user);
    return this.sanitizeUser(user);
  }
  async updateAvatar(userId: string, avatarConfig: any) {
    const user = await this.findOne(userId);

    if (!user.userHash) {
      throw new NotFoundException('User hash not found');
    }

    try {
      // Mettre à jour l'avatar via le service Avatar
      const avatarResult = await this.avatarService.update(
        user.userHash,
        avatarConfig
      );

      // Mettre à jour l'URL de l'avatar dans l'utilisateur
      user.avatarUrl = avatarResult.avatar.url;
      await user.save();

      console.log(` Avatar mis à jour pour ${user.email}`);

      return this.sanitizeUser(user);
    } catch (error) {
      console.error(' Erreur mise à jour avatar:', error.message);
      throw error;
    }
  }


  async regenerateAvatar(userId: string) {
    const user = await this.findOne(userId);

    if (!user.userHash) {
      throw new NotFoundException('User hash not found');
    }

    try {
      // Générer un nouvel avatar aléatoire
      const avatarResult = await this.avatarService.generateRandom(user.userHash);

      // Mettre à jour l'URL
      user.avatarUrl = avatarResult.avatar.url;
      await user.save();

      console.log(`✅ Nouvel avatar généré pour ${user.email}`);

      return this.sanitizeUser(user);
    } catch (error) {
      console.error('❌ Erreur régénération avatar:', error.message);
      throw error;
    }
  }
  async remove(id: string) {
    const user = await this.findOne(id);
    if (user.userHash) {
      try {
        await this.avatarService.remove(user.userHash);
        console.log(`Avatar supprimé pour ${user.email}`);
      } catch (error) {
        console.error(' Erreur suppression avatar:', error.message);
      }
    }
    const result = await this.userModel.findByIdAndDelete(id);
    if (!result) {
      throw new NotFoundException('User not found');
    }
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
  async verifyOtp(verifyOtpDto: VerifyOtpDto) {
    const user = await this.findByEmail(verifyOtpDto.identifier);
    if (!user) throw new NotFoundException('User not found');

    if (user.isVerified) return { message: 'Already verified' };

    if (!user.otpHash || !user.otpExpires) {
      throw new BadRequestException('No OTP request found. Please request a new code.');
    }

    if (user.otpExpires < new Date()) {
      throw new BadRequestException('OTP expired. Please request a new code.');
    }

    // throttle attempts
    user.otpAttempts = (user.otpAttempts || 0) + 1;
    if (user.otpAttempts > 5) {
      await user.save();
      throw new BadRequestException('Too many attempts. Request a new OTP.');
    }

    const isMatch = await bcrypt.compare(verifyOtpDto.code, user.otpHash);
    if (!isMatch) {
      await user.save();
      throw new BadRequestException('Invalid OTP code.');
    }

    // success: mark verified
    user.isVerified = true;
    user.otpHash = undefined;
    user.otpExpires = undefined;
    user.otpAttempts = 0;
    await user.save();

    return { message: 'Email verified successfully' };
  }
  async resendOtp(resendOtpDto: ResendOtpDto) {
    const user = await this.findByEmail(resendOtpDto.email);
    if (!user) throw new NotFoundException('User not found');

    // rate limit: at least 60s between resends, or max 3 resends per hour (implement counters/timestamps)
    const otp = this.generateNumericOtp(6);
    const otpHash = await bcrypt.hash(otp, 10);
    const expiry = addMinutes(new Date(), 10);

    user.otpHash = otpHash;
    user.otpExpires = expiry;
    user.otpAttempts = 0;
    await user.save();

    await this.mailService.sendOtpEmail(user.email, user.name, otp);

    return { message: 'OTP resent' };
  }
  private generateUserHash(email: string): string {
    const timestamp = Date.now();
    const random = uuidv4().substring(0, 8);
    const hash = `${email.split('@')[0]}-${timestamp}-${random}`;
    return hash.toLowerCase().replace(/[^a-z0-9-]/g, '');
  }
  // Supprime les champs sensibles (mot de passe, token) avant de renvoyer l'utilisateur  
  private sanitizeUser(user: any) {
    const obj = user.toObject();
    delete obj.password;
    delete obj.refreshToken;
    return obj;
  }
}
