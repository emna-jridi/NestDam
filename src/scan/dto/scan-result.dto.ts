import { MLResultDto } from './ml-result.dto';
import { TrackerResultDto } from './tracker-result.dto';
import { SAATResultDto } from './saat-result.dto';
import { RecommendationDto } from './recommendation.dto';

export class ScanResultDto {
  scanId: string;
  packageName: string;
  appName: string;
  versionCode: string;
  versionName: string;
  
  level: 'SMART' | 'DEEP';
  analysisType: 'installed_app' | 'apk_upload';
  status: 'COMPLETED' | 'FAILED' | 'IN_PROGRESS' | 'QUEUED';
  
  // Scoring
  securityScore: number; // 0-100
  privacyScore: number; // 0-100
  globalRisk: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  overallScore: number; // 0-100

  confidenceScore: number; // 0-100
  recommendDeepAnalysis: boolean;
  
  // Results
  ml?: MLResultDto;
  trackers?: TrackerResultDto;
  saat?: SAATResultDto;
  cloudAnalysis?: Record<string, any>;
  
  // Progress & Timing
  startTime: Date;
  endTime?: Date;
  duration?: number; // seconds
  progressPercentage: number;
  currentStep?: string;
  estimatedTimeRemaining?: number; // seconds
  
  // Recommendations
  recommendations: RecommendationDto[];
  
  // Manifest info
  minimumSdkVersion?: number;
  targetSdkVersion?: number;
  permissions?: string[];
  
  // Metadata
  certificateValid: boolean;
  certificateFingerprint?: string;
  signatureValid: boolean;
  
  // Errors
  errors?: string[];
  warnings?: string[];
  
  // Cache info
  fromCache: boolean;
  cacheExpiresAt?: Date;
  
  // Debugging
  _debug?: {
    extractionErrors?: string[];
    serviceTimings?: Record<string, number>;
  };
}
