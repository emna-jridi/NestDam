
import { ScanType } from './ScanTypes';

export interface ScanRecommendation {
  recommendedScan: ScanType;
  reason: string;
}
