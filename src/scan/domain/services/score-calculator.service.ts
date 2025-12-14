import { Injectable } from '@nestjs/common';
import { AnalysisResultDto } from '../dtos/analysis-result.dto';
import { AppDto } from '../dtos/app.dto';

@Injectable()
export class ScoreCalculatorService {
  readonly riskBands = {
    low: { min: 0, max: 39 },
    medium: { min: 40, max: 69 },
    high: { min: 70, max: 84 },
    critical: { min: 85, max: 100 },
  } as const;

  /**
   * Calculate risk score based on permissions, trackers, and AI analysis
   */
  calculateRiskScore(
    permissions: Record<string, any>,
    trackers: Record<string, any>,
    aiSummary: string,
    aiRiskScoreInput?: number,
  ): {
    aiRiskScore: number;
    aiRiskLevel: 'low' | 'medium' | 'high' | 'critical';
  } {
    // Permission-based scoring (0-100)
    const permissionScore = this.scorePermissions(permissions || {});

    // Tracker-based scoring (0-100)
    const trackerScore = this.scoreTrackers(trackers || {});

    // AI score: prefer structured aiRiskScore when provided, otherwise keyword heuristic
    const aiScore = typeof aiRiskScoreInput === 'number' && !Number.isNaN(aiRiskScoreInput)
      ? Math.min(100, Math.max(0, Math.round(aiRiskScoreInput)))
      : this.scoreAISummary(aiSummary);

    // Weighted aggregate aligned to permissions + trackers + AI
    const weightedScore = (permissionScore * 0.35) + (trackerScore * 0.25) + (aiScore * 0.4);
    const finalScore = Math.min(100, Math.max(0, Math.round(weightedScore)));
    const level = this.scoreToLevel(finalScore);

    return {
      aiRiskScore: finalScore,
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
    if (score >= this.riskBands.critical.min) return 'critical';
    if (score >= this.riskBands.high.min) return 'high';
    if (score >= this.riskBands.medium.min) return 'medium';
    return 'low';
  }

  getRiskLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
    return this.scoreToLevel(score);
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
