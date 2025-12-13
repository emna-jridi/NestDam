import { AppEntity } from './app.entity';

export type ScanStatus = 'pending' | 'analyzing' | 'completed' | 'failed';

export interface ScanStatisticsEntity {
  totalApps: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  deviceRiskScore: number;
}

export interface ScanResultsEntity {
  apps?: any[];
  globalSummary?: string;
  globalRecommendations?: string[];
  statistics?: ScanStatisticsEntity;
}

export interface ScanEntity {
  id: string;
  userId: string;
  deviceId: string;
  platform: 'android' | 'ios';
  status: ScanStatus;
  apps: AppEntity[];
  results?: ScanResultsEntity;
  createdAt?: Date;
  completedAt?: Date;
  duration?: number;
  errorMessage?: string;
  totalApps?: number;
  scannedApps?: number;
}
