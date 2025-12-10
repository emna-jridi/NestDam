import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [
    MongooseModule.forRoot(
      process.env.MONGO_URI || 'mongodb://localhost:27017/usermanagement',
    ),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule {}
