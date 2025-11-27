export interface TrackerDetectionContext {
  packageName: string;
  platform: 'android' | 'ios';
  permissions?: string[];
  appName?: string;
  category?: string;
  installs?: string;
}

export interface DetectedTracker {
  name: string;
  confidence: number; 
  reason?: string;
}

export interface TrackerDetectionResult {
  trackers: DetectedTracker[];
  method: 'exodus' | 'heuristic' | 'ai' | 'hybrid';
  confidence: number; 
  processingTime: number; 
  needsDeepAnalysis?: boolean; 
}

export interface DeepAnalysisResult {
  trackers: DetectedTracker[];
  riskScore: number; // 0-100
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  concerns: string[];
  positivePoints: string[];
  recommendations: Recommendation[];
  shouldUninstall: boolean;
  alternatives?: string[];
  confidence: number;
  processingTime: number;
}

export interface Recommendation {
  action: string;
  impact: string;
  howTo: string;
  platform: 'android' | 'ios' | 'both';
}