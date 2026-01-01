// src/scan/core/scan-result.ts

import { ScanType } from './ScanTypes';
import { RiskLevel } from './risk-level';
import { Finding } from './Finding';

export interface ScanResult {
  scanType: ScanType;

  securityScore: number; // 0–100
  privacyScore: number;  // 0–100
  globalRisk: RiskLevel;

  findings: Finding[];

  recommendation?: {
    upgradeTo: ScanType;
    reason: string;
  };
}
