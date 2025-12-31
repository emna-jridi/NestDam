import { ScanType } from './ScanTypes';
import { ScanScore } from './score';
import { ScanRecommendation } from './recommendation';

export class ScanFlow {
  static nextRecommendation(
    current: ScanType,
    score: ScanScore,
  ): ScanRecommendation | null {
    // Si score critique → deep obligatoire
    if (score.global >= 80 && current !== ScanType.DEEP) {
      return {
        recommendedScan: ScanType.DEEP,
        reason:
          'High risk detected. Deep Scan is strongly recommended for advanced analysis.',
      };
    }

    // Si privacy moyenne → standard
    if (score.breakdown.privacy < 60 && current === ScanType.QUICK) {
      return {
        recommendedScan: ScanType.STANDARD,
        reason:
          'Privacy risks detected. Standard Scan will provide tracker analysis.',
      };
    }

    return null;
  }
}
