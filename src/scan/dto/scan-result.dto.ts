import { MLResultDto } from './ml-result.dto';
import { TrackerResultDto } from './tracker-result.dto';
import { SAATResultDto } from './saat-result.dto';
import { RecommendationDto } from './recommendation.dto';

/**
 * ML Analysis explanation and recommendations from hybrid analysis
 */
export interface MLAnalysisDto {
  explanation: string;
  recommendations: string[];
  riskFactors: string[];
  safetyTips: string[];
  analysisDetails: {
    permissionsAnalysis: string;
    trackersAnalysis: string;
    behaviorAnalysis: string;
  };
  analysisSource: 'tensorflow' | 'gemini' | 'hybrid';
}

export class ScanResultDto {
  scanId: string;
  packageName: string;
  appName: string;
  versionCode: string;
  versionName: string;

  level: 'SMART' | 'DEEP';
  analysisType: 'installed_app' | 'apk_upload';
  platform: 'android' | 'ios';
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

  // ML Hybrid Analysis (Gemini + TensorFlow)
  mlAnalysis?: MLAnalysisDto;

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
