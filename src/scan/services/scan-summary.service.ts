
import { Injectable } from '@nestjs/common';

@Injectable()
export class ScanSummaryService {

  generate(results: any[]) {
    const valid = results.filter((r) => !r.error);

    if (valid.length === 0) {
      return {
        avgScore: 0,
        riskDistribution: { critical: 0, high: 0, medium: 0, low: 0 },
        totalAlerts: 0,
        mostDangerousApps: [],
      };
    }

    const avgScore = valid.reduce((sum, r) => sum + r.score, 0) / valid.length;

    return {
      avgScore: Math.round(avgScore),
      riskDistribution: {
        critical: valid.filter((r) => r.riskLevel === 'CRITICAL').length,
        high: valid.filter((r) => r.riskLevel === 'HIGH').length,
        medium: valid.filter((r) => r.riskLevel === 'MEDIUM').length,
        low: valid.filter((r) => r.riskLevel === 'LOW').length,
      },
      totalAlerts: valid.reduce((sum, r) => sum + r.alerts.length, 0),
      mostDangerousApps: valid
        .sort((a, b) => a.score - b.score)
        .slice(0, 5)
        .map((r) => ({
          packageName: r.packageName,
          name: r.name,
          score: r.score,
        })),
    };
  }
}