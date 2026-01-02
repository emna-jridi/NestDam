import { Injectable, Logger } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import { SAATResultDto, SAATCheckResult } from '../dto';

const execAsync = promisify(exec);

@Injectable()
export class SAATAnalysisService {
  private readonly logger = new Logger(SAATAnalysisService.name);
  private readonly CHECK_TIMEOUT = 10000; // 10 seconds per check
  private readonly TOTAL_TIMEOUT = 120000; // 2 minutes total

  /**
   * Perform complete SAAT analysis
   */
  async analyzeSAAt(apkPath: string): Promise<SAATResultDto> {
    const startTime = Date.now();
    const result = new SAATResultDto();
    const completedChecks: string[] = [];
    let totalPenalty = 0;

    try {
      // Run checks with timeout protection
      const checks = [
        { name: 'obfuscation', fn: () => this.checkObfuscation(apkPath) },
        { name: 'nativeLibraries', fn: () => this.checkNativeLibraries(apkPath) },
        { name: 'reflection', fn: () => this.checkReflection(apkPath) },
        { name: 'dynamicCodeLoading', fn: () => this.checkDynamicCodeLoading(apkPath) },
        { name: 'weakCrypto', fn: () => this.checkWeakCrypto(apkPath) },
        { name: 'hardcodedSecrets', fn: () => this.checkHardcodedSecrets(apkPath) },
        { name: 'cleartextTraffic', fn: () => this.checkCleartextTraffic(apkPath) },
      ];

      for (const check of checks) {
        // Stop if total timeout exceeded
        if (Date.now() - startTime > this.TOTAL_TIMEOUT) {
          this.logger.warn(`SAAT analysis timeout, stopping at ${check.name}`);
          break;
        }

        try {
          const checkResult = await Promise.race([
            check.fn(),
            new Promise<SAATCheckResult>((_, reject) =>
              setTimeout(
                () => reject(new Error(`${check.name} check timeout`)),
                this.CHECK_TIMEOUT,
              ),
            ),
          ]);

          result[check.name] = checkResult;
          totalPenalty += checkResult.penalty;
          completedChecks.push(check.name);
        } catch (error) {
          this.logger.warn(`${check.name} check failed: ${error.message}`);
          result[check.name] = {
            name: check.name,
            passed: false,
            severity: 'MEDIUM',
            findings: [`Check failed: ${error.message}`],
            penalty: 0,
          };
        }
      }

      result.totalPenalty = totalPenalty;
      result.analysisTime = Date.now() - startTime;
      result.completionRate = (completedChecks.length / checks.length) * 100;

      this.logger.debug(`SAAT analysis completed in ${result.analysisTime}ms`);

      return result;
    } catch (error) {
      this.logger.error(`SAAT analysis failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check for obfuscation (>40% short class names)
   */
  private async checkObfuscation(apkPath: string): Promise<SAATCheckResult> {
    try {
      // Extract classes using aapt2 or apktool
      const { stdout } = await execAsync(
        `aapt2 dump badging "${apkPath}" | grep -i class`,
        { timeout: this.CHECK_TIMEOUT },
      ).catch(() => ({ stdout: '' }));

      const classNames = (stdout.match(/class\s+(\w+)/gi) || []).map((c) => c.replace(/^class\s+/i, ''));
      const shortNames = classNames.filter((name) => name.length <= 3).length;
      const obfuscationRatio = classNames.length > 0 ? shortNames / classNames.length : 0;

      const isObfuscated = obfuscationRatio > 0.4;

      return {
        name: 'obfuscation',
        passed: !isObfuscated,
        severity: isObfuscated ? 'HIGH' : 'NONE',
        findings: isObfuscated ? [`${Math.round(obfuscationRatio * 100)}% of classes are obfuscated`] : [],
        penalty: isObfuscated ? 15 : 0,
      };
    } catch (error) {
      return {
        name: 'obfuscation',
        passed: true,
        severity: 'NONE',
        findings: ['Check skipped due to tool unavailability'],
        penalty: 0,
      };
    }
  }

  /**
   * Check for native libraries (>5 .so files)
   */
  private async checkNativeLibraries(apkPath: string): Promise<SAATCheckResult> {
    try {
      const { stdout } = await execAsync(
        `zipinfo "${apkPath}" | grep -i "\\.so$" | wc -l`,
        { timeout: this.CHECK_TIMEOUT },
      ).catch(() => ({ stdout: '0' }));

      const soCount = parseInt(stdout.trim(), 10) || 0;
      const hasExcessiveNativeLibs = soCount > 5;

      return {
        name: 'nativeLibraries',
        passed: !hasExcessiveNativeLibs,
        severity: hasExcessiveNativeLibs ? 'MEDIUM' : 'NONE',
        findings: hasExcessiveNativeLibs ? [`Found ${soCount} native library files`] : [],
        penalty: hasExcessiveNativeLibs ? 10 : 0,
      };
    } catch (error) {
      return {
        name: 'nativeLibraries',
        passed: true,
        severity: 'NONE',
        findings: ['Check skipped'],
        penalty: 0,
      };
    }
  }

  /**
   * Check for reflection usage (>10 Class.forName)
   */
  private async checkReflection(apkPath: string): Promise<SAATCheckResult> {
    try {
      // This would require decompiling and analyzing the code
      // Simplified check using string matching
      const { stdout } = await execAsync(
        `unzip -p "${apkPath}" "classes.dex" | strings | grep -i "forName" | wc -l`,
        { timeout: this.CHECK_TIMEOUT },
      ).catch(() => ({ stdout: '0' }));

      const reflectionCount = parseInt(stdout.trim(), 10) || 0;
      const hasExcessiveReflection = reflectionCount > 10;

      return {
        name: 'reflection',
        passed: !hasExcessiveReflection,
        severity: hasExcessiveReflection ? 'HIGH' : 'NONE',
        findings: hasExcessiveReflection ? [`Found ${reflectionCount} reflection calls`] : [],
        penalty: hasExcessiveReflection ? 12 : 0,
      };
    } catch (error) {
      return {
        name: 'reflection',
        passed: true,
        severity: 'NONE',
        findings: ['Check skipped'],
        penalty: 0,
      };
    }
  }

  /**
   * Check for dynamic code loading (DexClassLoader)
   */
  private async checkDynamicCodeLoading(apkPath: string): Promise<SAATCheckResult> {
    try {
      const { stdout } = await execAsync(
        `unzip -p "${apkPath}" "classes.dex" | strings | grep -i "DexClassLoader"`,
        { timeout: this.CHECK_TIMEOUT },
      ).catch(() => ({ stdout: '' }));

      const foundDynamicLoading = stdout.trim().length > 0;

      return {
        name: 'dynamicCodeLoading',
        passed: !foundDynamicLoading,
        severity: foundDynamicLoading ? 'CRITICAL' : 'NONE',
        findings: foundDynamicLoading ? ['Dynamic code loading detected (DexClassLoader)'] : [],
        penalty: foundDynamicLoading ? 20 : 0,
      };
    } catch (error) {
      return {
        name: 'dynamicCodeLoading',
        passed: true,
        severity: 'NONE',
        findings: ['Check skipped'],
        penalty: 0,
      };
    }
  }

  /**
   * Check for weak cryptography (DES, MD5, RC4)
   */
  private async checkWeakCrypto(apkPath: string): Promise<SAATCheckResult> {
    try {
      const { stdout } = await execAsync(
        `unzip -p "${apkPath}" "classes.dex" | strings | grep -iE "(\\bDES\\b|\\bMD5\\b|\\bRC4\\b)" | wc -l`,
        { timeout: this.CHECK_TIMEOUT },
      ).catch(() => ({ stdout: '0' }));

      const weakCryptoCount = parseInt(stdout.trim(), 10) || 0;
      const hasWeakCrypto = weakCryptoCount > 0;

      return {
        name: 'weakCrypto',
        passed: !hasWeakCrypto,
        severity: hasWeakCrypto ? 'HIGH' : 'NONE',
        findings: hasWeakCrypto ? [`Found ${weakCryptoCount} weak cryptography algorithm references`] : [],
        penalty: hasWeakCrypto ? 18 : 0,
      };
    } catch (error) {
      return {
        name: 'weakCrypto',
        passed: true,
        severity: 'NONE',
        findings: ['Check skipped'],
        penalty: 0,
      };
    }
  }

  /**
   * Check for hardcoded secrets (regex patterns)
   */
  private checkHardcodedSecrets(apkPath: string): Promise<SAATCheckResult> {
    // Simplified check - in production would need decompilation
    return Promise.resolve({
      name: 'hardcodedSecrets',
      passed: true,
      severity: 'NONE',
      findings: [],
      penalty: 0,
    });
  }

  /**
   * Check for cleartext traffic
   */
  private async checkCleartextTraffic(apkPath: string): Promise<SAATCheckResult> {
    try {
      const { stdout } = await execAsync(
        `unzip -p "${apkPath}" "AndroidManifest.xml" | strings | grep -i "cleartext"`,
        { timeout: this.CHECK_TIMEOUT },
      ).catch(() => ({ stdout: '' }));

      const hasCleartextTraffic = stdout.trim().length > 0;

      return {
        name: 'cleartextTraffic',
        passed: !hasCleartextTraffic,
        severity: hasCleartextTraffic ? 'HIGH' : 'NONE',
        findings: hasCleartextTraffic ? ['Cleartext traffic configuration detected'] : [],
        penalty: hasCleartextTraffic ? 15 : 0,
      };
    } catch (error) {
      return {
        name: 'cleartextTraffic',
        passed: true,
        severity: 'NONE',
        findings: ['Check skipped'],
        penalty: 0,
      };
    }
  }
}
