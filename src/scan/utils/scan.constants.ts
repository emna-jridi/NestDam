export const SCAN_ERRORS = {
  SCAN_001: 'Invalid APK file format. Only .apk and .aab files are supported.',
  SCAN_002: 'APK file exceeds maximum size of 200MB.',
  SCAN_003: 'Failed to validate APK signature using apksigner.',
  SCAN_004: 'Failed to extract manifest using aapt2.',
  SCAN_005: 'APK file is corrupt or invalid.',
  SCAN_006: 'ML inference timeout exceeded (5 seconds).',
  SCAN_007: 'Tracker detection API error - falling back to local database.',
  SCAN_008: 'Feature extraction incomplete - using default values.',
  SCAN_009: 'N8N orchestration failed - maximum retries exceeded.',
  SCAN_010: 'Internal server error during scan processing.',
};

export const SCAN_ERROR_CODES = {
  INVALID_FILE_FORMAT: 'SCAN_001',
  FILE_TOO_LARGE: 'SCAN_002',
  INVALID_SIGNATURE: 'SCAN_003',
  MANIFEST_EXTRACTION_FAILED: 'SCAN_004',
  CORRUPT_APK: 'SCAN_005',
  ML_TIMEOUT: 'SCAN_006',
  TRACKER_API_ERROR: 'SCAN_007',
  FEATURE_EXTRACTION_INCOMPLETE: 'SCAN_008',
  N8N_ORCHESTRATION_FAILED: 'SCAN_009',
  INTERNAL_ERROR: 'SCAN_010',
};

export const DANGEROUS_PERMISSIONS = [
  'android.permission.CAMERA',
  'android.permission.RECORD_AUDIO',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.READ_CONTACTS',
  'android.permission.WRITE_CONTACTS',
  'android.permission.READ_CALL_LOG',
  'android.permission.WRITE_CALL_LOG',
  'android.permission.READ_SMS',
  'android.permission.SEND_SMS',
  'android.permission.RECEIVE_SMS',
  'android.permission.READ_CALENDAR',
  'android.permission.WRITE_CALENDAR',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
];

export const PERMISSION_CATEGORIES = {
  INTERNET: ['android.permission.INTERNET', 'android.permission.ACCESS_NETWORK_STATE'],
  SMS: ['android.permission.READ_SMS', 'android.permission.SEND_SMS', 'android.permission.RECEIVE_SMS'],
  LOCATION: ['android.permission.ACCESS_FINE_LOCATION', 'android.permission.ACCESS_COARSE_LOCATION'],
  CAMERA: ['android.permission.CAMERA'],
  CONTACTS: ['android.permission.READ_CONTACTS', 'android.permission.WRITE_CONTACTS'],
  STORAGE: ['android.permission.READ_EXTERNAL_STORAGE', 'android.permission.WRITE_EXTERNAL_STORAGE'],
};

export const SCAN_PROGRESS_STEPS = [
  'extracting_apk',
  'parsing_manifest',
  'extracting_features',
  'ml_inference',
  'tracker_detection',
  'saat_analysis',
  'cloud_processing',
  'finalizing',
];

export const STEP_WEIGHTS = {
  extracting_apk: 0.1,
  parsing_manifest: 0.1,
  extracting_features: 0.15,
  ml_inference: 0.15,
  tracker_detection: 0.15,
  saat_analysis: 0.2,
  cloud_processing: 0.1,
  finalizing: 0.05,
};

export const FEATURE_NORMALIZATION_RANGES = {
  permissions_count: 50,
  dangerous_permissions_count: 20,
  min_sdk_version: 35,
  app_size_mb: 200,
};
