
import { ScanContext } from './scan-context';
import { ScanResult } from './scan-result';
import { ScoreEngine } from './score-engine';
import { RecommendationEngine } from './recommendation-engine';
import { RiskLevel } from './risk-level';

export class ScanAggregator {
  static aggregate(context: ScanContext): ScanResult {
    const securityScore = ScoreEngine.computeSecurityScore(context.findings);
    const privacyScore = ScoreEngine.computePrivacyScore(context.findings);

    const globalRisk =
      Math.min(securityScore, privacyScore) < 40
        ? RiskLevel.CRITICAL
        : Math.min(securityScore, privacyScore) < 60
        ? RiskLevel.HIGH
        : Math.min(securityScore, privacyScore) < 80
        ? RiskLevel.MEDIUM
        : RiskLevel.LOW;

    const result: ScanResult = {
      scanType: context.scanType,
      securityScore,
      privacyScore,
      globalRisk,
      findings: context.findings,
    };

    result.recommendation = RecommendationEngine.recommend(result);
    return result;
  }
}
