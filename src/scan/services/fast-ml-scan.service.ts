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
  modelVersion: string;
  permissions: string[];
  topContributingFeatures: { name: string; impact: number; value: number }[];
}

@Injectable()
export class FastMLScanService {
  private readonly logger = new Logger(FastMLScanService.name);
  private readonly pythonScriptPath = path.join(
    process.cwd(),
    'ml',
    'fast_scan.py',
  );
  // Python with the ml/requirements.txt packages (e.g. full path to python.exe on Windows)
  private readonly pythonBin = process.env.PYTHON_BIN || 'python';
  // Written by ml/train.py: version, threshold, test metrics
  private readonly metadataPath = path.join(process.cwd(), 'ml', 'models', 'metadata.json');

  getModelInfo(): Record<string, any> {
    return JSON.parse(fs.readFileSync(this.metadataPath, 'utf-8'));
  }

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
      const { stdout, stderr } = await execFileAsync(this.pythonBin, [
        this.pythonScriptPath,
        apkPath,
      ], {
        timeout: 180000, // 3 min: full dex parsing of big installed apps (Play apps can be 100+ MB)
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
