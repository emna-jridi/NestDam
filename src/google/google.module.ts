import { Module } from '@nestjs/common';
import { GoogleService } from './google.service';
import { UsersModule } from 'src/users/users.module';
import { AuthModule } from 'src/auth/auth.module';
import { JwtService } from '@nestjs/jwt';

@Module({
  imports: [UsersModule ,AuthModule ],
  providers: [GoogleService, JwtService],
  exports: [GoogleService]
})
export class GoogleModule {}
