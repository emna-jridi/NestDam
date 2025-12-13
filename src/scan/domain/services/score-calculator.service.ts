import { Injectable } from '@nestjs/common';
import { AnalysisResultDto } from '../dtos/analysis-result.dto';
import { AppDto } from '../dtos/app.dto';

@Injectable()
export class ScoreCalculatorService {
  /**
   * Calculate risk score based on permissions, trackers, and AI analysis
   */
  calculateRiskScore(
    permissions: Record<string, any>,
    trackers: Record<string, any>,
    aiSummary: string,
  ): {
    aiRiskScore: number;
    aiRiskLevel: 'low' | 'medium' | 'high' | 'critical';
  } {
    let score = 0;

    // Permission-based scoring
    const permissionScore = this.scorePermissions(permissions || {});
    score += permissionScore * 0.3;

    // Tracker-based scoring
    const trackerScore = this.scoreTrackers(trackers || {});
    score += trackerScore * 0.2;

    // AI analysis scoring
    const aiScore = this.scoreAISummary(aiSummary);
    score += aiScore * 0.5;

    const finalScore = Math.min(100, Math.max(0, score));
    const level = this.scoreToLevel(finalScore);

    return {
      aiRiskScore: Math.round(finalScore),
      aiRiskLevel: level,
    };
  }

  /**
   * Score permissions based on sensitivity and count
   */
  private scorePermissions(permissions: Record<string, any>): number {
    const sensitivePermissions = {
      'android.permission.ACCESS_FINE_LOCATION': 15,
      'android.permission.ACCESS_COARSE_LOCATION': 10,
      'android.permission.CAMERA': 12,
      'android.permission.RECORD_AUDIO': 12,
      'android.permission.READ_CONTACTS': 10,
      'android.permission.READ_CALENDAR': 8,
      'android.permission.READ_SMS': 15,
      'android.permission.SEND_SMS': 15,
      'android.permission.READ_PHONE_STATE': 8,
      'android.permission.GET_ACCOUNTS': 8,
      'android.permission.WRITE_EXTERNAL_STORAGE': 5,
      'android.permission.READ_EXTERNAL_STORAGE': 5,
      'android.permission.INTERNET': 3,
    };

    let score = 0;
    const permList = Array.isArray(permissions)
      ? permissions
      : Object.keys(permissions).filter(k => permissions[k]);

    for (const perm of permList) {
      score += sensitivePermissions[perm] || 2;
    }

    return Math.min(100, score);
  }

  /**
   * Score trackers based on count and types
   */
  private scoreTrackers(trackers: Record<string, any>): number {
    const trackerCount = Array.isArray(trackers)
      ? trackers.length
      : Object.keys(trackers).filter(k => trackers[k]).length;

    // Each tracker adds 5 points, capped at 100
    return Math.min(100, trackerCount * 5);
  }

  /**
   * Score AI analysis summary for risk indicators
   */
  private scoreAISummary(summary: string): number {
    if (!summary) return 0;

    const riskKeywords = {
      critical: ['malware', 'trojan', 'ransomware', 'spyware', 'keylogger'],
      high: ['suspicious', 'risky', 'privacy violation', 'data theft', 'exploit'],
      medium: ['unusual', 'questionable', 'monitoring', 'tracking', 'hidden'],
      low: ['caution', 'minor', 'potential', 'consider'],
    };

    let score = 0;
    const lowerSummary = summary.toLowerCase();

    for (const keyword of riskKeywords.critical) {
      if (lowerSummary.includes(keyword)) score += 30;
    }
    for (const keyword of riskKeywords.high) {
      if (lowerSummary.includes(keyword)) score += 15;
    }
    for (const keyword of riskKeywords.medium) {
      if (lowerSummary.includes(keyword)) score += 8;
    }
    for (const keyword of riskKeywords.low) {
      if (lowerSummary.includes(keyword)) score += 3;
    }

    return Math.min(100, score);
  }

  /**
   * Convert numerical score to risk level
   */
  private scoreToLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
    if (score >= 80) return 'critical';
    if (score >= 60) return 'high';
    if (score >= 40) return 'medium';
    return 'low';
  }

  /**
   * Aggregate multiple analysis results into final recommendation
   */
  aggregateResults(results: AnalysisResultDto[]): {
    globalSummary: string;
    globalRecommendations: string[];
    avgRiskScore: number;
    maxRiskLevel: string;
  } {
    if (results.length === 0) {
      return {
        globalSummary: 'No analysis results available.',
        globalRecommendations: [],
        avgRiskScore: 0,
        maxRiskLevel: 'low',
      };
    }

    const scores = results.map(r => r.aiRiskScore);
    const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

    const levelMap = { low: 0, medium: 1, high: 2, critical: 3 };
    const maxLevel = results.reduce((max, r) => {
      return levelMap[r.aiRiskLevel] > levelMap[max.aiRiskLevel] ? r : max;
    });

    const recommendations = new Set<string>();
    results.forEach(r => {
      r.aiRecommendations?.forEach(rec => recommendations.add(rec));
    });

    return {
      globalSummary: `Analyzed ${results.length} applications with average risk score ${avgScore}. Maximum risk level: ${maxLevel.aiRiskLevel}.`,
      globalRecommendations: Array.from(recommendations).slice(0, 10),
      avgRiskScore: avgScore,
      maxRiskLevel: maxLevel.aiRiskLevel,
    };
  }

  /**
   * Calculate predictive risk score based on store rating and AI summary
   * Used for apps before they are installed (search results)
   */
  calculatePredictiveScore(
    storeRating: number,
    aiSummary: string,
  ): {
    score: number;
    level: 'low' | 'medium' | 'high' | 'critical';
  } {
    // Base score from store rating (inverted: low rating = high risk)
    // Rating 5.0 = 20 risk points, Rating 1.0 = 80 risk points
    const ratingScore = storeRating > 0 
      ? Math.round(100 - (storeRating / 5) * 80)
      : 50;

    // AI analysis score
    const aiScore = this.scoreAISummary(aiSummary);

    // Weighted average: 60% AI, 40% rating
    const finalScore = Math.round(aiScore * 0.6 + ratingScore * 0.4);
    const level = this.scoreToLevel(finalScore);

    return {
      score: Math.min(100, Math.max(0, finalScore)),
      level,
    };
  }
}
