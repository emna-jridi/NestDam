import { Controller, Post, UploadedFile, UseInterceptors, Body } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ScanService } from './scan.service';
import { MetadataDto } from './dto/metadata.dto';
import { diskStorage } from 'multer';
import { ApiTags, ApiConsumes } from '@nestjs/swagger';
import { extname } from 'path';

@ApiTags('scan')
@Controller('scan')
export class ScanController {
  constructor(private readonly scanService: ScanService) {}

  // 1️⃣ Upload APK → MobSF
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: './uploads',
      filename: (req, file, cb) => cb(null, Date.now() + extname(file.originalname)),
    }),
  }))
  @ApiConsumes('multipart/form-data')
  async uploadApk(@UploadedFile() file: Express.Multer.File) {
    return this.scanService.uploadApk(file.path);
  }

  // 2️⃣ Analyse metadata → scoring simple
  @Post('metadata')
  async scanMetadata(@Body() metadata: MetadataDto) {
    return this.scanService.analyzeMetadata(metadata);
  }
}
