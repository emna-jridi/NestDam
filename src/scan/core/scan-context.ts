// src/scan/core/scan-context.ts

import { ScanType } from './ScanTypes';
import { Finding } from './Finding';

export interface ScanContext {
  scanId: string;
  scanType: ScanType;
  startedAt: Date;

  findings: Finding[];

  metadata: {
    appName: string;
    packageName: string;
    version?: string;
  };
}
