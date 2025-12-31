import { ScanType } from './ScanTypes';

export interface ScanContext {
  scanId: string;
  appPackage: string;

  initialScan: ScanType;
  currentScan: ScanType;

  userRequestedUpgrade: boolean;
}
