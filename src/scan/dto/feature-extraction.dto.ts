export class FeatureExtractionDto {
  // Core ML features - MUST MATCH TRAINING ORDER
  dangerous_permissions: number; // Normalized count of dangerous permissions (0-1)
  internet_permission: number; // Has INTERNET permission (0 or 1)
  min_sdk_version: number; // Normalized min SDK (0-1)
  activities_count: number; // Normalized activity count (0-1)
  services_count: number; // Normalized service count (0-1)
  receivers_count: number; // Normalized receiver count (0-1)
  providers_count: number; // Normalized provider count (0-1)
  exported_components: number; // Normalized exported component ratio (0-1)
  intent_filters_count: number; // Normalized intent filter count (0-1)
  uses_native_code: number; // Uses native code (0 or 1)
  has_reflection: number; // Uses reflection (0 or 1)
  obfuscation_score: number; // Code obfuscation level (0-1)

  // Legacy fields (for backward compatibility)
  permissions_count?: number;
  dangerous_permissions_count?: number;
  has_internet?: number;
  has_sms?: number;
  has_location?: number;
  has_camera?: number;
  has_contacts?: number;
  has_storage?: number;
  is_system_app?: number;
  app_size_mb?: number;
  signature_valid?: number;

  // Additional fields
  targetSdkVersion?: number;
  appName?: string;
  packageName?: string;
  versionCode?: string;
  versionName?: string;
  certificateFingerprint?: string;

  extractionErrors?: string[];
}
