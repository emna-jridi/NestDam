import { FindingSeverity } from './Finding';

export class ScoreEngine {
  static computeSecurityScore(findings: any[]): number {
    let score = 100;

    for (const f of findings) {
      if (f.category === 'SECURITY') {
        score -= this.penalty(f.severity);
      }
    }

    return Math.max(0, score);
  }

  static computePrivacyScore(findings: any[]): number {
    let score = 100;

    for (const f of findings) {
      if (f.category === 'PRIVACY') {
        score -= this.penalty(f.severity);
      }
    }

    return Math.max(0, score);
  }

  private static penalty(severity: FindingSeverity): number {
    switch (severity) {
      case FindingSeverity.CRITICAL: return 30;
      case FindingSeverity.HIGH: return 20;
      case FindingSeverity.MEDIUM: return 10;
      case FindingSeverity.LOW: return 5;
      default: return 0;
    }
  }
}
