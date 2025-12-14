import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Vault, VaultSchema } from './schemas/vault.schema';
import { PasswordEntry, PasswordEntrySchema } from './schemas/password-entry.schema';
import { VaultBackup, VaultBackupSchema } from './schemas/vault-backup.schema';
import { VaultController } from './controllers/vault.controller';
import { PasswordEntryController } from './controllers/password-entry.controller';
import { VaultService } from './services/vault.service';
import { PasswordEntryService } from './services/password-entry.service';
import { CryptoService } from './services/crypto.service';
import { PasswordStrengthService } from './services/password-strength.service';
import { VaultAiService } from './services/vault-ai.service';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Vault.name, schema: VaultSchema },
      { name: PasswordEntry.name, schema: PasswordEntrySchema },
      { name: VaultBackup.name, schema: VaultBackupSchema },
    ]),
    HttpModule,
  ],
  controllers: [VaultController, PasswordEntryController],
  providers: [
    VaultService,
    PasswordEntryService,
    CryptoService,
    PasswordStrengthService,
    VaultAiService,
  ],
  exports: [VaultService, PasswordEntryService, CryptoService, VaultAiService],
})
export class VaultModule { }
