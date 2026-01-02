
import { ScanType } from './ScanTypes';
import { ScanResult } from './scan-result';

export class RecommendationEngine {
  static recommend(result: ScanResult): ScanResult['recommendation'] {
    if (result.scanType === ScanType.QUICK) {
      if (result.securityScore < 80 || result.privacyScore < 80) {
        return {
          upgradeTo: ScanType.STANDARD,
          reason: 'Potential risks detected. A deeper analysis is recommended.',
        };
      }
    }

    if (result.scanType === ScanType.STANDARD) {
      if (
        result.securityScore < 70 ||
        result.privacyScore < 70 ||
        result.findings.some((f: any) => f.severity === 'HIGH')
      ) {
        return {
          upgradeTo: ScanType.DEEP,
          reason: 'High-risk indicators detected. Deep scan recommended.',
        };
      }
    }

    return undefined;
  }
}
