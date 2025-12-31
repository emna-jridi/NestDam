import { ScanType } from './ScanTypes';
import { ScanCapability } from './scan-capability';

export const ScanProfiles: Record<ScanType, ScanCapability[]> = {
  [ScanType.QUICK]: [
    ScanCapability.PERMISSIONS_ANALYSIS,
    ScanCapability.HEURISTIC_ANALYSIS,
  ],

  [ScanType.STANDARD]: [
    ScanCapability.PERMISSIONS_ANALYSIS,
    ScanCapability.HEURISTIC_ANALYSIS,
    ScanCapability.TRACKER_DETECTION,
    ScanCapability.ML_BEHAVIOR_ANALYSIS,
    ScanCapability.EXODUS_LOOKUP,
  ],

  [ScanType.DEEP]: [
    ScanCapability.PERMISSIONS_ANALYSIS,
    ScanCapability.HEURISTIC_ANALYSIS,
    ScanCapability.TRACKER_DETECTION,
    ScanCapability.ML_BEHAVIOR_ANALYSIS,
    ScanCapability.EXODUS_LOOKUP,
    ScanCapability.SAAT_ANALYSIS,
    ScanCapability.APK_DECOMPILATION,
    ScanCapability.NETWORK_INSPECTION,
  ],
};
