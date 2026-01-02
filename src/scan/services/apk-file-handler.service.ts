import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as axios from 'axios';
import {
  ScanUtils,
  InvalidApkFormatException,
  FileTooLargeException,
  CorruptApkException,
  InvalidSignatureException,
  ManifestExtractionFailedException,
} from '../utils';

@Injectable()
export class APKFileHandlerService {
  private readonly logger = new Logger(APKFileHandlerService.name);
  private readonly MAX_FILE_SIZE_MB = 200;
  private readonly APK_TEMP_BASE = process.env.APK_TEMP_DIR || '/tmp/shadowguard';
  private cleanupTimers = new Map<string, NodeJS.Timeout>();

  constructor() {
    // Ensure temp directory exists
    if (!fs.existsSync(this.APK_TEMP_BASE)) {
      fs.mkdirSync(this.APK_TEMP_BASE, { recursive: true });
    }
  }

  /**
   * Handle file upload
   */
  async handleFileUpload(file: Express.Multer.File): Promise<{
    apkPath: string;
    tempDir: string;
    packageName: string;
    appName: string;
    versionCode: string;
    versionName: string;
    manifest: string;
    certificateFingerprint: string;
    signatureValid: boolean;
  }> {
    const startTime = Date.now();

    try {
      // Validate file format
      if (!ScanUtils.isValidApkFormat(file.originalname)) {
        throw new InvalidApkFormatException();
      }

      // Validate file size
      if (!ScanUtils.isFileSizeValid(file.path, this.MAX_FILE_SIZE_MB)) {
        fs.unlinkSync(file.path);
        throw new FileTooLargeException();
      }

      // Verify APK integrity
      const isIntegral = await ScanUtils.verifyApkIntegrity(file.path);
      if (!isIntegral) {
        fs.unlinkSync(file.path);
        throw new CorruptApkException();
      }

      // Create temp directory for extraction
      const tempDir = ScanUtils.createTempDirectory(this.APK_TEMP_BASE);

      // Validate signature
      const signatureResult = await ScanUtils.validateApkSignature(file.path);
      if (!signatureResult.valid) {
        this.logger.warn(
          `Invalid signature for ${file.originalname}: ${signatureResult.error}`,
        );
      }

      // Extract manifest information
      const manifestInfo = await ScanUtils.extractManifest(file.path);
      if (!manifestInfo.packageName) {
        ScanUtils.cleanupTempDirectory(tempDir);
        fs.unlinkSync(file.path);
        throw new ManifestExtractionFailedException();
      }

      // Extract full manifest XML
      await ScanUtils.extractAndroidManifestXml(file.path, tempDir);
      const manifestXmlPath = path.join(tempDir, 'AndroidManifest.xml');
      let fullManifest = manifestInfo.manifest || '';

      if (fs.existsSync(manifestXmlPath)) {
        try {
          // Try to read binary manifest (will be binary, but we can parse it with aapt2)
          fullManifest = await this.decompileManifest(file.path);
        } catch (error) {
          this.logger.warn(`Failed to decompile manifest: ${error.message}`);
          fullManifest = manifestInfo.manifest || '';
        }
      }

      // Schedule cleanup for this temp directory (24 hours)
      this.scheduleCleanup(file.path, tempDir, 1440);

      this.logger.debug(
        `APK file processed successfully in ${Date.now() - startTime}ms: ${manifestInfo.packageName}`,
      );

      return {
        apkPath: file.path,
        tempDir,
        packageName: manifestInfo.packageName,
        appName: ScanUtils.extractAppName(fullManifest) || manifestInfo.packageName,
        versionCode: manifestInfo.versionCode || '1',
        versionName: manifestInfo.versionName || '1.0.0',
        manifest: fullManifest,
        certificateFingerprint: signatureResult.fingerprint || 'UNKNOWN',
        signatureValid: signatureResult.valid,
      };
    } catch (error) {
      // Cleanup on error
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
      throw error;
    }
  }

  /**
   * Handle APK download from URL
   */
  async handleApkUrl(url: string): Promise<{
    apkPath: string;
    tempDir: string;
    packageName: string;
    appName: string;
    versionCode: string;
    versionName: string;
    manifest: string;
    certificateFingerprint: string;
    signatureValid: boolean;
  }> {
    const startTime = Date.now();

    try {
      // Validate URL
      new URL(url); // Throws if invalid

      // Create temp directory
      const tempDir = ScanUtils.createTempDirectory(this.APK_TEMP_BASE);
      const filename = `${Date.now()}.apk`;
      const apkPath = path.join(tempDir, filename);

      // Download APK
      this.logger.debug(`Downloading APK from ${url}`);
      const response = await axios.default.get(url, {
        responseType: 'arraybuffer',
        timeout: 60000,
        maxRedirects: 5,
        headers: {
          'User-Agent': 'ShadowGuard/2.0',
        },
      });

      // Write to file
      fs.writeFileSync(apkPath, response.data);

      // Validate file size
      if (!ScanUtils.isFileSizeValid(apkPath, this.MAX_FILE_SIZE_MB)) {
        ScanUtils.cleanupTempDirectory(tempDir);
        throw new FileTooLargeException();
      }

      // Verify APK integrity
      const isIntegral = await ScanUtils.verifyApkIntegrity(apkPath);
      if (!isIntegral) {
        ScanUtils.cleanupTempDirectory(tempDir);
        throw new CorruptApkException();
      }

      // Validate signature
      const signatureResult = await ScanUtils.validateApkSignature(apkPath);

      // Extract manifest information
      const manifestInfo = await ScanUtils.extractManifest(apkPath);
      if (!manifestInfo.packageName) {
        ScanUtils.cleanupTempDirectory(tempDir);
        throw new ManifestExtractionFailedException();
      }

      const fullManifest = await this.decompileManifest(apkPath).catch(() => manifestInfo.manifest || '');

      // Schedule cleanup
      this.scheduleCleanup(apkPath, tempDir, 1440);

      this.logger.debug(
        `APK downloaded and processed successfully in ${Date.now() - startTime}ms: ${manifestInfo.packageName}`,
      );

      return {
        apkPath,
        tempDir,
        packageName: manifestInfo.packageName,
        appName: ScanUtils.extractAppName(fullManifest) || manifestInfo.packageName,
        versionCode: manifestInfo.versionCode || '1',
        versionName: manifestInfo.versionName || '1.0.0',
        manifest: fullManifest,
        certificateFingerprint: signatureResult.fingerprint || 'UNKNOWN',
        signatureValid: signatureResult.valid,
      };
    } catch (error) {
      this.logger.error(`Failed to handle APK URL: ${error.message}`);
      throw error;
    }
  }

  /**
   * Decompile manifest using apktool (if available)
   */
  private async decompileManifest(apkPath: string): Promise<string> {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    try {
      // Try using apktool or aapt2 dump xmltree
      const { stdout } = await execAsync(
        `aapt2 dump xmltree "${apkPath}" AndroidManifest.xml`,
        { timeout: 10000, maxBuffer: 10 * 1024 * 1024 },
      );
      return stdout;
    } catch (error) {
      this.logger.warn(`Failed to decompile manifest with aapt2: ${error.message}`);
      // Fallback to badging
      const { stdout } = await execAsync(
        `aapt2 dump badging "${apkPath}"`,
        { timeout: 10000, maxBuffer: 10 * 1024 * 1024 },
      );
      return stdout;
    }
  }

  /**
   * Schedule cleanup of APK file and temp directory
   */
  private scheduleCleanup(apkPath: string, tempDir: string, minutesDelay: number): void {
    const scanId = path.basename(tempDir);
    const timer = setTimeout(() => {
      try {
        if (fs.existsSync(apkPath)) {
          fs.unlinkSync(apkPath);
          this.logger.debug(`Cleaned up APK file: ${apkPath}`);
        }
        if (fs.existsSync(tempDir)) {
          ScanUtils.cleanupTempDirectory(tempDir);
          this.logger.debug(`Cleaned up temp directory: ${tempDir}`);
        }
        this.cleanupTimers.delete(scanId);
      } catch (error) {
        this.logger.error(`Failed to cleanup ${tempDir}: ${error.message}`);
      }
    }, minutesDelay * 60 * 1000);

    this.cleanupTimers.set(scanId, timer);
  }

  /**
   * Force cleanup immediately
   */
  forceCleanup(tempDir: string): void {
    const scanId = path.basename(tempDir);
    const timer = this.cleanupTimers.get(scanId);

    if (timer) {
      clearTimeout(timer);
      this.cleanupTimers.delete(scanId);
    }

    try {
      if (fs.existsSync(tempDir)) {
        ScanUtils.cleanupTempDirectory(tempDir);
      }
    } catch (error) {
      this.logger.error(`Failed to force cleanup: ${error.message}`);
    }
  }

  /**
   * Download APK by package name from Google Play (requires gplaycli or similar)
   * This is a placeholder for potential integration
   */
  async downloadFromGooglePlay(packageName: string): Promise<string> {
    this.logger.warn(
      `Google Play download not implemented for ${packageName}. User must provide APK file or URL.`,
    );
    throw new Error('Google Play download not supported in this version');
  }
}
