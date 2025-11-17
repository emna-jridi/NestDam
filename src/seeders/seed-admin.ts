/**
 * Admin User Seeder
 *
 * Creates an admin user for backoffice access.
 *
 * Usage:
 *   npx ts-node src/seeders/seed-admin.ts
 *
 * Environment Variables:
 *   ADMIN_EMAIL - Admin email (default: admin@shadowguard.com)
 *   ADMIN_PASSWORD - Admin password (default: Admin123!)
 *   ADMIN_NAME - Admin first name (default: Admin)
 *   ADMIN_SURNAME - Admin last name (default: User)
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { UsersService } from '../user-management/services/users.service';
import { BasicRoles } from '../user-management/enums/basic-roles.enum';
import { Model } from 'mongoose';
import { User, UserDocument } from '../user-management/entities/user.entity';
import { getModelToken } from '@nestjs/mongoose';
import * as dotenv from 'dotenv';

dotenv.config();

async function seedAdmin() {
  const app = await NestFactory.createApplicationContext(AppModule);

  const usersService = app.get(UsersService);
  const userModel = app.get<Model<UserDocument>>(getModelToken(User.name));

  const adminEmail = process.env.ADMIN_EMAIL || 'superadmin@example.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'superpassword';
  const adminName = process.env.ADMIN_NAME || 'Super';
  const adminSurname = process.env.ADMIN_SURNAME || 'Admin';
  const adminPhone = process.env.ADMIN_PHONE || '+1234567891';
  try {
    console.log('🔐 Seeding admin user...');
    console.log(`   Email: ${adminEmail}`);
    console.log(`   Name: ${adminName} ${adminSurname}`);

    // Check if admin already exists
    const existingAdmin = await usersService.findByEmail(adminEmail);
    if (existingAdmin) {
      console.log('⚠️  Admin user already exists!');
      console.log(`   ID: ${existingAdmin._id.toString()}`);
      console.log(`   Role: ${existingAdmin.role}`);

      // Update to admin role if not already
      if (existingAdmin.role !== BasicRoles.Admin) {
        const existingAdminDoc = existingAdmin as UserDocument;
        await userModel.findByIdAndUpdate(
          existingAdminDoc._id,
          { role: BasicRoles.Admin },
          { new: true },
        );
        console.log('✅ Updated existing user to admin role');
      } else {
        console.log('ℹ️  User already has admin role');
      }

      await app.close();
      return;
    }

    // Create admin user (create method only accepts User role, so we update after)
    // Omit phone and avatar if not provided to avoid unique constraint issues
    const createUserDto: {
      email: string;
      password: string;
      name: string;
      surname: string;
      phone?: string;
    } = {
      email: adminEmail,
      password: adminPassword,
      name: adminName,
      surname: adminSurname,
      phone: adminPhone,
    };

    const admin = await usersService.create(createUserDto, BasicRoles.User);

    // Update role to admin using model directly (since UpdateUserDto doesn't include role)
    const adminDoc = admin as UserDocument;
    const updatedAdmin = await userModel.findByIdAndUpdate(
      adminDoc._id,
      { role: BasicRoles.Admin },
      { new: true },
    );

    if (!updatedAdmin) {
      throw new Error('Failed to update admin role');
    }

    console.log('✅ Admin user created successfully!');
    console.log(`   ID: ${updatedAdmin._id.toString()}`);
    console.log(`   Email: ${updatedAdmin.email}`);
    console.log(`   Role: ${updatedAdmin.role}`);
    console.log('\n📝 Login credentials:');
    console.log(`   Email: ${adminEmail}`);
    console.log(`   Password: ${adminPassword}`);
    console.log('\n⚠️  Please change the password after first login!');
  } catch (error) {
    console.error('❌ Error seeding admin:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
    }
    process.exit(1);
  } finally {
    await app.close();
  }
}

seedAdmin().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
