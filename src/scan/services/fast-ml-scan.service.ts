import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '@nestjs/common';

const execFileAsync = promisify(execFile);

export interface FastScanResult {
  score: number;
  verdict: 'benign' | 'malicious';
  threshold: number;
  recommendation: 'SMART' | 'DEEP' | null;
}

@Injectable()
export class FastMLScanService {
  private readonly logger = new Logger(FastMLScanService.name);
  private readonly pythonScriptPath = path.join(
    process.cwd(),
    'ml',
    'fast_scan.py',
  );

  async scanApk(apkPath: string): Promise<FastScanResult> {
    // Validate APK path exists
    if (!fs.existsSync(apkPath)) {
      throw new BadRequestException(`APK file not found: ${apkPath}`);
    }

    if (!apkPath.endsWith('.apk')) {
      throw new BadRequestException('File must be an APK');
    }

    try {
      this.logger.debug(`Starting FAST scan for: ${apkPath}`);

      // Execute Python script
      const { stdout, stderr } = await execFileAsync('python', [
        this.pythonScriptPath,
        apkPath,
      ], {
        timeout: 30000, // 30 second timeout
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      });

      if (stderr && !stderr.includes('UserWarning')) {
        this.logger.warn(`Python stderr: ${stderr}`);
      }

      // Parse JSON output
      const result = this._parseJsonOutput(stdout);
      this.logger.debug(`Scan result: ${JSON.stringify(result)}`);

      return result;
    } catch (error) {
      if (error.code === 'ETIMEDOUT') {
        throw new InternalServerErrorException(
          'Scan timeout - APK too large or complex',
        );
      }
      this.logger.error(`Scan failed: ${error.message}`);
      throw new InternalServerErrorException(
        `Failed to scan APK: ${error.message}`,
      );
    }
  }

  async scanApkBuffer(buffer: Buffer, filename: string): Promise<FastScanResult> {
    // Create temporary file from buffer
    const tempDir = path.join(process.cwd(), 'temp-scans');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempPath = path.join(tempDir, `${Date.now()}_${filename}`);

    try {
      // Write buffer to temp file
      fs.writeFileSync(tempPath, buffer);
      this.logger.debug(`Created temp APK: ${tempPath}`);

      // Scan
      const result = await this.scanApk(tempPath);

      return result;
    } finally {
      // Clean up temp file
      try {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
          this.logger.debug(`Cleaned up temp file: ${tempPath}`);
        }
      } catch (e) {
        this.logger.warn(`Failed to clean up temp file: ${e.message}`);
      }
    }
  }

  private _parseJsonOutput(output: string): FastScanResult {
    // Find JSON in output (skip debug logs)
    const jsonMatch = output.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new InternalServerErrorException('No valid JSON output from scanner');
    }

    try {
      return JSON.parse(jsonMatch[0]);
    } catch (e) {
      throw new InternalServerErrorException(
        `Failed to parse scanner output: ${e.message}`,
      );
    }
  }
}
