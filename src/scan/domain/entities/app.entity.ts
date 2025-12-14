export interface PermissionEntity {
  name: string;
  translation?: string;
  riskLevel?: 'normal' | 'dangerous' | 'signature';
  explanation?: string;
}

export interface TrackerEntity {
  name: string;
  category?: string;
  risk?: 'low' | 'medium' | 'high';
}

export interface StoreDataEntity {
  rating?: number;
  downloads?: string;
  developer?: string;
  lastUpdate?: Date;
}

export interface ScanResultEntity {
  aiRiskScore: number;
  aiRiskLevel: 'low' | 'medium' | 'high' | 'critical';
  aiSummary: string;
  aiRecommendations: string[];
  permissions?: PermissionEntity[];
  trackers?: TrackerEntity[];
}

export interface FinalScoreEntity {
  score: number;
  storeWeight: number;
  ollamaWeight: number;
  breakdown: string;
}

export interface AppEntity {
  id?: string;
  packageName: string;
  appName: string;
  version?: string;
  platform?: 'android' | 'ios';
  permissions?: string[];
  installedDate?: Date;
  storeData?: StoreDataEntity;
  scanResults?: ScanResultEntity;
  finalScore?: FinalScoreEntity;
  lastScanned?: Date;
  fileName?: string;
  mobsfHash?: string;
  scanType?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
