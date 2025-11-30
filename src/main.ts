import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
    app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));
  app.useGlobalPipes(new ValidationPipe());
  app.enableCors();

  const config = new DocumentBuilder()
    .setTitle('User Management API')
    .setDescription('Simple user management - Mobile App (User) & Web (Admin)')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

<<<<<<< HEAD
  await app.listen(3000, '0.0.0.0');
  console.log('🚀 Server: http://localhost:3000');
  console.log('📚 Swagger: http://localhost:3000/api');
  console.log('📱 Mobile: http://192.168.137.162:3000');
=======
  await app.listen(3000, '0.0.0.0'); // listen on all interfaces
  console.log('🚀 Server: http://localhost:3000');
  console.log('📚 Swagger: http://localhost:3000/api');
>>>>>>> origin/report
}
bootstrap();
