import { Injectable, Logger } from '@nestjs/common';
import { ScanResultDto, RecommendationDto } from '../dto';

@Injectable()
export class ScoringService {
  private readonly logger = new Logger(ScoringService.name);

  /**
   * Calculate security score (0-100)
   * Formula: 100 - (malwareProbability × 50 + SAAT penalties + invalid signature (-20))
   */
  calculateSecurityScore(
    malwareProbability: number,
    saatPenalty: number,
    signatureValid: boolean,
  ): number {
    let score = 100;

    // Malware probability weight
    score -= malwareProbability * 50;

    // SAAT penalties
    score -= saatPenalty;

    // Invalid signature penalty
    if (!signatureValid) {
      score -= 20;
    }

    // Clamp to 0-100
    return Math.max(0, Math.min(100, Math.round(score * 100) / 100));
  }

  /**
   * Calculate privacy score (0-100)
   * Formula: 100 - (advertising × 10 + analytics × 5 + cross-app × 8 + location × 15 + excessive perms -20)
   */
  calculatePrivacyScore(
    advertisingTrackers: number,
    analyticsTrackers: number,
    crossappTrackers: number,
    locationTrackers: number,
    excessivePermissions: boolean,
    dangerousPermissionsCount: number,
  ): number {
    let score = 100;

    // Tracker penalties
    score -= advertisingTrackers * 10;
    score -= analyticsTrackers * 5;
    score -= crossappTrackers * 8;
    score -= locationTrackers * 15;

    // Permission penalties
    if (excessivePermissions) {
      score -= 20;
    }

    if (dangerousPermissionsCount > 5) {
      score -= (dangerousPermissionsCount - 5) * 3;
    }

    // Clamp to 0-100
    return Math.max(0, Math.min(100, Math.round(score * 100) / 100));
  }

  /**
   * Determine global risk level based on scores
   * CRITICAL → security <30 OR privacy <20
   * HIGH → security <50 OR privacy <40
   * MEDIUM → security <70 OR privacy <60
   * LOW → otherwise
   */
  determineGlobalRisk(
    securityScore: number,
    privacyScore: number,
  ): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' {
    if (securityScore < 30 || privacyScore < 20) {
      return 'CRITICAL';
    }

    if (securityScore < 50 || privacyScore < 40) {
      return 'HIGH';
    }

    if (securityScore < 70 || privacyScore < 60) {
      return 'MEDIUM';
    }

    return 'LOW';
  }

  /**
   * Calculate overall score (weighted average)
   * Weights: security 60%, privacy 40%
   */
  calculateOverallScore(securityScore: number, privacyScore: number): number {
    const overall = securityScore * 0.6 + privacyScore * 0.4;
    return Math.round(overall * 100) / 100;
  }
}
