
import { ScanType } from './ScanTypes';
import { ScanCapability } from './scan-capability';
import { ScanProfiles } from './scan-profile';

export class Capabilities {
  static has(
    scanType: ScanType,
    capability: ScanCapability,
  ): boolean {
    return ScanProfiles[scanType]?.includes(capability);
  }

  static list(scanType: ScanType): ScanCapability[] {
    return ScanProfiles[scanType] ?? [];
  }
}
