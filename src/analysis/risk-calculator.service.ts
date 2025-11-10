
import { Injectable } from '@nestjs/common';

interface RiskFactors {
  permissions: string[];
  trackers: string[];
  isDebuggable: boolean;
  communityScore?: number;
  hasUnknownTrackers?: boolean;
}

@Injectable()
export class RiskCalculatorService {
  
  calculateRiskScore(factors: RiskFactors): {
    score: number;
    breakdown: any;
    alerts: string[];
  } {
    let score = 100;
    const breakdown = {};
    const alerts: string[] = [];

    // 1. Permissions dangereuses (-30 points max)
    const dangerousPerms = this.getDangerousPermissions(factors.permissions);
    const permPenalty = Math.min(30, dangerousPerms.length * 10);
    score -= permPenalty;
    breakdown['permissions'] = {
      penalty: permPenalty,
      count: dangerousPerms.length,
      list: dangerousPerms,
    };

    if (dangerousPerms.length > 0) {
      alerts.push(`${dangerousPerms.length} permission(s) dangereuse(s) détectée(s)`);
    }

    // 2. Trackers (-25 points max)
    const trackerPenalty = Math.min(25, factors.trackers.length * 3);
    score -= trackerPenalty;
    breakdown['trackers'] = {
      penalty: trackerPenalty,
      count: factors.trackers.length,
    };

    if (factors.trackers.length > 5) {
      alerts.push(`${factors.trackers.length} trackers détectés`);
    }

    // 3. App debuggable (-20 points)
    if (factors.isDebuggable) {
      score -= 20;
      breakdown['debuggable'] = { penalty: 20 };
      alerts.push('Application debuggable (CRITIQUE)');
    }

    // 4. Bonus score communauté (+10 si bon)
    if (factors.communityScore && factors.communityScore >= 4) {
      score += 10;
      breakdown['community'] = { bonus: 10 };
    }

    // 5. Trackers inconnus (-10)
    if (factors.hasUnknownTrackers) {
      score -= 10;
      breakdown['unknownTrackers'] = { penalty: 10 };
      alerts.push('Trackers non référencés détectés');
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      breakdown,
      alerts,
    };
  }

  private getDangerousPermissions(permissions: string[]): string[] {
    const dangerousList = [
      'android.permission.READ_SMS',
      'android.permission.SEND_SMS',
      'android.permission.READ_CONTACTS',
      'android.permission.WRITE_CONTACTS',
      'android.permission.RECORD_AUDIO',
      'android.permission.CAMERA',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.READ_CALL_LOG',
      'android.permission.WRITE_CALL_LOG',
      'android.permission.READ_CALENDAR',
      'android.permission.WRITE_CALENDAR',
      'android.permission.GET_ACCOUNTS',
      'android.permission.READ_PHONE_STATE',
      'android.permission.CALL_PHONE',
    ];

    return permissions.filter(p => dangerousList.includes(p));
  }

  getRiskLevel(score: number): string {
    if (score >= 70) return 'LOW';
    if (score >= 40) return 'MEDIUM';
    if (score >= 20) return 'HIGH';
    return 'CRITICAL';
  }

  getRiskColor(score: number): string {
    if (score >= 70) return '#2ECC71'; // Green
    if (score >= 40) return '#F39C12'; // Orange
    if (score >= 20) return '#E67E22'; // Dark orange
    return '#E74C3C'; // Red
  }
}