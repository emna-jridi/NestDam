
import { ScanType } from './ScanTypes';
import { ScanScore } from './score';
import { Finding } from './Finding';
import { ScanRecommendation } from './recommendation';

export interface ScanResult {
  scanId: string;
  appPackage: string;
  scanType: ScanType;

  startedAt: Date;
  finishedAt?: Date;

  score: ScanScore;
  findings: Finding[];

  recommendation?: ScanRecommendation;
}
