import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { FeatureExtractionDto } from '../dto/feature-extraction.dto';
import { ScanUtils, DANGEROUS_PERMISSIONS, PERMISSION_CATEGORIES, FEATURE_NORMALIZATION_RANGES } from '../utils';

@Injectable()
export class FeatureExtractionService {
  private readonly logger = new Logger(FeatureExtractionService.name);

  /**
   * Extract 12+ features from APK
   */
  async extractFeatures(
    apkPath: string,
    manifest: string,
    appName: string,
    packageName: string,
  ): Promise<FeatureExtractionDto> {
    const startTime = Date.now();
    const features = new FeatureExtractionDto();
    const errors: string[] = [];

    try {
      // Parse permissions from manifest
      const permissions = this.parsePermissions(manifest);
      const dangerousPerms = permissions.filter((p) => DANGEROUS_PERMISSIONS.includes(p));

      // Feature 0: dangerous_permissions (normalized 0-1)
      features.dangerous_permissions = Math.min(dangerousPerms.length / 10, 1);

      // Feature 1: internet_permission (0 or 1)
      features.internet_permission = this.hasPermission(permissions, PERMISSION_CATEGORIES.INTERNET) ? 1 : 0;

      // Feature 2: min_sdk_version (normalized 0-1)
      const minSdk = this.extractSdkVersion(manifest, 'min');
      features.min_sdk_version = Math.min(Math.max((minSdk || 21) / 34, 0), 1);
      const targetSdk = this.extractSdkVersion(manifest, 'target');
      features.targetSdkVersion = targetSdk || 21;

      // Feature 3-6: Component counts (normalized 0-1)
      const activities = this.extractComponentCount(manifest, 'activity');
      const services = this.extractComponentCount(manifest, 'service');
      const receivers = this.extractComponentCount(manifest, 'receiver');
      const providers = this.extractComponentCount(manifest, 'provider');

      features.activities_count = Math.min(activities / 100, 1);
      features.services_count = Math.min(services / 50, 1);
      features.receivers_count = Math.min(receivers / 50, 1);
      features.providers_count = Math.min(providers / 20, 1);

      // Feature 7: exported_components (ratio 0-1)
      const totalComponents = activities + services + receivers + providers;
      const exportedCount = this.extractExportedCount(manifest);
      features.exported_components = totalComponents > 0 ? Math.min(exportedCount / totalComponents, 1) : 0;

      // Feature 8: intent_filters_count (normalized 0-1)
      const intentFilters = this.extractIntentFilterCount(manifest);
      features.intent_filters_count = Math.min(intentFilters / 100, 1);

      // Feature 9: uses_native_code (0 or 1)
      features.uses_native_code = manifest.includes('android:hasCode="true"') || manifest.includes('.so"') ? 1 : 0;

      // Feature 10: has_reflection (0 or 1) - check for common reflection patterns
      features.has_reflection = this.detectReflectionUsage(manifest, packageName);

      // Feature 11: obfuscation_score (0-1)
      features.obfuscation_score = this.estimateObfuscation(manifest, packageName);

      // Legacy fields for backward compatibility
      features.permissions_count = ScanUtils.normalizeFeature(
        permissions.length,
        FEATURE_NORMALIZATION_RANGES.permissions_count,
      );
      features.dangerous_permissions_count = ScanUtils.normalizeFeature(
        dangerousPerms.length,
        FEATURE_NORMALIZATION_RANGES.dangerous_permissions_count,
      );
      features.has_internet = features.internet_permission;
      features.has_sms = this.hasPermission(permissions, PERMISSION_CATEGORIES.SMS) ? 1 : 0;
      features.has_location = this.hasPermission(permissions, PERMISSION_CATEGORIES.LOCATION) ? 1 : 0;
      features.has_camera = this.hasPermission(permissions, PERMISSION_CATEGORIES.CAMERA) ? 1 : 0;
      features.has_contacts = this.hasPermission(permissions, PERMISSION_CATEGORIES.CONTACTS) ? 1 : 0;
      features.has_storage = this.hasPermission(permissions, PERMISSION_CATEGORIES.STORAGE) ? 1 : 0;
      features.is_system_app = ScanUtils.isSystemApp(packageName) ? 1 : 0;
      const appSizeMB = ScanUtils.getFileSizeMB(apkPath);
      features.app_size_mb = Math.min(
        ScanUtils.normalizeFeature(appSizeMB, FEATURE_NORMALIZATION_RANGES.app_size_mb),
        1,
      );
      features.signature_valid = 1;

      // Metadata
      features.packageName = packageName;
      features.appName = appName;
      features.extractionErrors = errors;

      this.logger.debug(
        `Feature extraction completed in ${Date.now() - startTime}ms for ${packageName}`,
      );

      return features;
    } catch (error) {
      this.logger.error(
        `Feature extraction failed for ${packageName}: ${error.message}`,
      );
      errors.push(error.message);

      // Return features with defaults and errors
      this.setDefaultFeatures(features, packageName, appName);
      features.extractionErrors = errors;

      return features;
    }
  }

  /**
   * Parse permissions from manifest string
   */
  private parsePermissions(manifest: string): string[] {
    const permissions = new Set<string>();

    // Pattern: uses-permission android:name="..."
    const usesPermRegex = /uses-permission[^>]*(?:android:)?name=['"]([^'"]+)['"]/gi;
    let match;

    while ((match = usesPermRegex.exec(manifest)) !== null) {
      permissions.add(match[1].trim());
    }

    return Array.from(permissions);
  }

  /**
   * Check if app has specific permission category
   */
  private hasPermission(permissions: string[], categoryPerms: string[]): boolean {
    return categoryPerms.some((perm) => permissions.includes(perm));
  }

  /**
   * Extract SDK version from manifest
   */
  private extractSdkVersion(manifest: string, type: 'min' | 'target'): number | null {
    const fieldName = type === 'min' ? 'minSdkVersion' : 'targetSdkVersion';
    const patterns = [
      new RegExp(`${fieldName}=['"]?(\\d+)['"]?`, 'i'),
      new RegExp(`android:${fieldName}=['"]?(\\d+)['"]?`, 'i'),
      new RegExp(`${type}-sdk-version=['"]?(\\d+)['"]?`, 'i'),
    ];

    for (const pattern of patterns) {
      const match = manifest.match(pattern);
      if (match && match[1]) {
        return parseInt(match[1], 10);
      }
    }

    return null;
  }

  /**
   * Set default feature values when extraction fails
   */
  private setDefaultFeatures(
    features: FeatureExtractionDto,
    packageName: string,
    appName: string,
  ): void {
    // Set training features with defaults
    features.dangerous_permissions = 0.3; // Default 30%
    features.internet_permission = 1; // Assume most apps need internet
    features.min_sdk_version = 0.6; // Default API ~21
    features.activities_count = 0.5; // Default moderate
    features.services_count = 0.3;
    features.receivers_count = 0.3;
    features.providers_count = 0.2;
    features.exported_components = 0.3;
    features.intent_filters_count = 0.5;
    features.uses_native_code = 0;
    features.has_reflection = 0;
    features.obfuscation_score = 0.2;

    // Set legacy features for backward compatibility
    features.permissions_count = 0.3;
    features.dangerous_permissions_count = 0.1;
    features.has_internet = 1;
    features.has_sms = 0;
    features.has_location = 0;
    features.has_camera = 0;
    features.has_contacts = 0;
    features.has_storage = 0;
    features.is_system_app = ScanUtils.isSystemApp(packageName) ? 1 : 0;
    features.app_size_mb = 0.2;
    features.signature_valid = 1;
    features.packageName = packageName;
    features.appName = appName;
  }

  /**
   * Validate if all required features are present
   */
  validateFeatures(features: FeatureExtractionDto): boolean {
    const required = [
      'dangerous_permissions',
      'internet_permission',
      'min_sdk_version',
      'activities_count',
      'services_count',
      'receivers_count',
      'providers_count',
      'exported_components',
      'intent_filters_count',
      'uses_native_code',
      'has_reflection',
      'obfuscation_score',
    ];

    return required.every((field) => features[field] !== undefined && features[field] !== null);
  }

  /**
   * Extract component count from manifest
   */
  private extractComponentCount(manifest: string, componentType: string): number {
    const regex = new RegExp(`<${componentType}[\\s>]`, 'gi');
    const matches = manifest.match(regex);
    return matches ? matches.length : 0;
  }

  /**
   * Extract exported component count
   */
  private extractExportedCount(manifest: string): number {
    const regex = /android:exported=["']true["']/gi;
    const matches = manifest.match(regex);
    return matches ? matches.length : 0;
  }

  /**
   * Extract intent filter count
   */
  private extractIntentFilterCount(manifest: string): number {
    const regex = /<intent-filter[\s>]/gi;
    const matches = manifest.match(regex);
    return matches ? matches.length : 0;
  }

  /**
   * Detect reflection usage (heuristic)
   */
  private detectReflectionUsage(manifest: string, packageName: string): number {
    // Common indicators: obfuscated package names, dynamic code loading
    const hasShortPackage = packageName.split('.').some(p => p.length <= 2);
    const hasDynamicCode = manifest.includes('DexClassLoader') || manifest.includes('PathClassLoader');
    return (hasShortPackage || hasDynamicCode) ? 1 : 0;
  }

  /**
   * Estimate obfuscation score (heuristic)
   */
  private estimateObfuscation(manifest: string, packageName: string): number {
    let score = 0;
    
    // Check for obfuscated package names (short, single-letter segments)
    const segments = packageName.split('.');
    const shortSegments = segments.filter(s => s.length <= 2).length;
    score += Math.min(shortSegments / segments.length, 0.5);
    
    // Check for obfuscated class names in manifest
    const classMatches = manifest.match(/android:name=["'][^"']+["']/g);
    if (classMatches) {
      const obfuscatedClasses = classMatches.filter(m => /["'][a-z]\.[a-z]["']/i.test(m)).length;
      score += Math.min(obfuscatedClasses / classMatches.length * 0.5, 0.5);
    }
    
    return Math.min(score, 1);
  }

  /**
   * Convert features to ML model input array
   */
  featuresToArray(features: FeatureExtractionDto): number[] {
    return [
      features.dangerous_permissions,
      features.internet_permission,
      features.min_sdk_version,
      features.activities_count,
      features.services_count,
      features.receivers_count,
      features.providers_count,
      features.exported_components,
      features.intent_filters_count,
      features.uses_native_code,
      features.has_reflection,
      features.obfuscation_score,
    ];
  }
}
