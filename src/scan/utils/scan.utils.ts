import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class ScanUtils {
  /**
   * Validate APK file extension
   */
  static isValidApkFormat(filename: string): boolean {
    const ext = path.extname(filename).toLowerCase();
    return ['.apk', '.aab'].includes(ext);
  }

  /**
   * Check if file size is within limits
   */
  static isFileSizeValid(filePath: string, maxSizeMB: number = 200): boolean {
    const stats = fs.statSync(filePath);
    const fileSizeMB = stats.size / (1024 * 1024);
    return fileSizeMB <= maxSizeMB;
  }

  /**
   * Get file size in MB
   */
  static getFileSizeMB(filePath: string): number {
    const stats = fs.statSync(filePath);
    return Math.round((stats.size / (1024 * 1024)) * 100) / 100;
  }

  /**
   * Calculate SHA256 hash for a file
   */
  static calculateFileHash(filePath: string): string {
    const fileBuffer = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  }

  /**
   * Calculate cache key from packageName, versionCode, and level
   */
  static calculateCacheKey(
    packageName: string,
    versionCode: string,
    level: string,
    analysisType: string,
  ): string {
    const combined = `${packageName}:${versionCode}:${level}:${analysisType}`;
    return crypto.createHash('sha256').update(combined).digest('hex');
  }

  /**
   * Validate APK signature using apksigner
   * Requires: Android SDK tools (apksigner)
   */
  static async validateApkSignature(apkPath: string): Promise<{
    valid: boolean;
    fingerprint?: string;
    signer?: string;
    error?: string;
  }> {
    try {
      const { stdout, stderr } = await execAsync(`apksigner verify --print-certs "${apkPath}"`, {
        timeout: 10000,
        maxBuffer: 10 * 1024 * 1024,
      });

      if (stderr && stderr.toLowerCase().includes('failed')) {
        return { valid: false, error: stderr };
      }

      // Extract certificate information from stdout
      const fingerprintMatch = stdout.match(/Certificate fingerprints:\s+([\w:]+)/i);
      const fingerprint = fingerprintMatch ? fingerprintMatch[1] : undefined;

      return { valid: true, fingerprint };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Extract manifest from APK using aapt2
   * Requires: Android SDK tools (aapt2)
   */
  static async extractManifest(apkPath: string): Promise<{
    packageName?: string;
    versionCode?: string;
    versionName?: string;
    minSdk?: number;
    targetSdk?: number;
    manifest?: string;
    error?: string;
  }> {
    try {
      const { stdout, stderr } = await execAsync(`aapt2 dump badging "${apkPath}"`, {
        timeout: 10000,
        maxBuffer: 10 * 1024 * 1024,
      });

      if (stderr && !stdout) {
        return { error: stderr };
      }

      // Parse output
      const packageMatch = stdout.match(/package: name='([^']+)'/);
      const versionCodeMatch = stdout.match(/versionCode='(\d+)'/);
      const versionNameMatch = stdout.match(/versionName='([^']+)'/);
      const minSdkMatch = stdout.match(/sdkVersion:'(\d+)'/);
      const targetSdkMatch = stdout.match(/targetSdkVersion:'(\d+)'/);

      return {
        packageName: packageMatch ? packageMatch[1] : undefined,
        versionCode: versionCodeMatch ? versionCodeMatch[1] : undefined,
        versionName: versionNameMatch ? versionNameMatch[1] : undefined,
        minSdk: minSdkMatch ? parseInt(minSdkMatch[1]) : undefined,
        targetSdk: targetSdkMatch ? parseInt(targetSdkMatch[1]) : undefined,
        manifest: stdout,
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Extract AndroidManifest.xml from APK using unzip
   * Requires: unzip command
   */
  static async extractAndroidManifestXml(apkPath: string, outputPath: string): Promise<boolean> {
    try {
      await execAsync(`unzip -j "${apkPath}" "AndroidManifest.xml" -d "${outputPath}"`, {
        timeout: 10000,
      });
      return fs.existsSync(path.join(outputPath, 'AndroidManifest.xml'));
    } catch (error) {
      return false;
    }
  }

  /**
   * Parse permissions from manifest string (basic regex parsing)
   */
  static parsePermissionsFromManifest(manifest: string): string[] {
    const permissions = new Set<string>();
    const permissionRegex = /permission-group-permission[\s\w:="']+name='([^']+)'/gi;

    // Try multiple patterns
    let match;

    // Pattern 1: uses-permission
    const usesPermRegex = /uses-permission[^>]*name='([^']+)'/gi;
    while ((match = usesPermRegex.exec(manifest)) !== null) {
      permissions.add(match[1]);
    }

    // Pattern 2: permission tag
    const permRegex = /<permission[^>]*android:name='([^']+)'/gi;
    while ((match = permRegex.exec(manifest)) !== null) {
      permissions.add(match[1]);
    }

    return Array.from(permissions);
  }

  /**
   * Check if APK is system app
   */
  static isSystemApp(packageName: string): boolean {
    const systemPackages = [
      'android',
      'com.android',
      'com.google.android',
      'com.sec.android',
      'system',
    ];
    return systemPackages.some((sp) => packageName.toLowerCase().startsWith(sp));
  }

  /**
   * Check if manifest contains cleartext traffic configuration
   */
  static hasCleartextTraffic(manifest: string): boolean {
    return (
      /cleartextTraffic\s*=\s*["']true["']/i.test(manifest) ||
      /cleartextTraffic>true</i.test(manifest)
    );
  }

  /**
   * Normalize feature value to 0-1 range
   */
  static normalizeFeature(value: number, max: number): number {
    const normalized = Math.min(value / max, 1);
    return Math.round(normalized * 1000) / 1000; // Round to 3 decimals
  }

  /**
   * Create temporary directory for APK processing
   */
  static createTempDirectory(base: string = '/tmp/shadowguard'): string {
    const tempDir = path.join(base, crypto.randomBytes(16).toString('hex'));
    fs.mkdirSync(tempDir, { recursive: true });
    return tempDir;
  }

  /**
   * Cleanup temporary directory recursively
   */
  static cleanupTempDirectory(dirPath: string): void {
    if (!fs.existsSync(dirPath)) return;

    fs.readdirSync(dirPath).forEach((file) => {
      const filePath = path.join(dirPath, file);
      if (fs.lstatSync(filePath).isDirectory()) {
        this.cleanupTempDirectory(filePath);
      } else {
        fs.unlinkSync(filePath);
      }
    });

    fs.rmdirSync(dirPath);
  }

  /**
   * Schedule directory cleanup after specified minutes
   */
  static scheduleCleanup(dirPath: string, minutesDelay: number = 1440): NodeJS.Timeout {
    return setTimeout(() => {
      try {
        if (fs.existsSync(dirPath)) {
          this.cleanupTempDirectory(dirPath);
        }
      } catch (error) {
        console.error(`Failed to cleanup ${dirPath}:`, error);
      }
    }, minutesDelay * 60 * 1000);
  }

  /**
   * Extract app name from manifest
   */
  static extractAppName(manifest: string): string | null {
    // Try to find app:label or android:label in manifest
    const match = manifest.match(/application.*?android:label='([^']+)'/is);
    return match ? match[1] : null;
  }

  /**
   * Verify APK integrity using zipinfo
   */
  static async verifyApkIntegrity(apkPath: string): Promise<boolean> {
    try {
      const { stdout, stderr } = await execAsync(`zipinfo -t "${apkPath}"`, {
        timeout: 10000,
      });
      return !stderr && stdout.includes('OK');
    } catch (error) {
      return false;
    }
  }
}
