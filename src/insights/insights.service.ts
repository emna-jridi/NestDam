import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Scan } from '../scan/schemas/scan.schema';
import {
  SecurityInsight,
  SecurityInsightDocument,
} from './schemas/security-insight.schema';
import { ScanService } from '../scan/scan.service';
import { AITipGeneratorService } from '../privacy-tips/services/ai-tip-generator.service';
import { RedisService } from '../redis/redis.service';
import {
  WeeklyInsightsResponseDto,
  WeeklySummaryDto,
  HighlightDto,
  TopRiskDto,
  RecommendationDto,
  WeeklyTrendsDto,
} from './dto/weekly-insights.dto';
import {
  MonthlyInsightsResponseDto,
  MonthlySummaryDto,
  AchievementDto,
  MonthlyTrendsDto,
} from './dto/monthly-insights.dto';
import {
  RecommendationsResponseDto,
  RecommendationResponseDto,
  RecommendationsSummaryDto,
} from './dto/recommendations.dto';

@Injectable()
export class InsightsService {
  private readonly logger = new Logger(InsightsService.name);

  constructor(
    @InjectModel(Scan.name) private scanModel: Model<Scan>,
    @InjectModel(SecurityInsight.name)
    private insightModel: Model<SecurityInsightDocument>,
    private aiTipGenerator: AITipGeneratorService,
    private redisService: RedisService,
  ) {}

  /**
   * Get weekly insights
   */
  async getWeeklyInsights(
    userId: string,
    deviceId?: string,
    week?: string,
    includeRecommendations = true,
    forceRefresh = false,
  ): Promise<WeeklyInsightsResponseDto> {
    // Check Redis cache first (skip if forceRefresh is true)
    const cacheKey = `insights:weekly:${userId}:${deviceId || 'all'}:${
      week || 'current'
    }`;

    if (!forceRefresh) {
      const cached =
        await this.redisService.get<WeeklyInsightsResponseDto>(cacheKey);
      if (cached) {
        this.logger.debug(`Cache hit for weekly insights: ${cacheKey}`);
        return cached;
      }
    } else {
      this.logger.debug(
        `Force refresh requested for weekly insights: ${cacheKey}`,
      );
    }

    // Calculate date range for the week
    const weekDates = this.calculateWeekRange(week);

    // Fetch scan data for the week
    const scans = await this.getScansByDateRange(
      userId,
      deviceId,
      weekDates.startDate,
      weekDates.endDate,
    );

    // Get previous week for comparison
    const previousWeekDates = this.getPreviousWeek(weekDates.startDate);
    const previousScans = await this.getScansByDateRange(
      userId,
      deviceId,
      previousWeekDates.startDate,
      previousWeekDates.endDate,
    );

    // Calculate summary statistics
    const summary = await this.calculateWeeklySummary(
      scans,
      previousScans,
      weekDates,
    );

    // Get top risks
    const topRisks = await this.getTopRisks(scans, 5);

    // Get AI recommendations (if requested)
    let recommendations: RecommendationDto[] = [];
    if (includeRecommendations) {
      recommendations = await this.generateRecommendations(
        userId,
        deviceId,
        scans,
        5,
      );
    }

    // Calculate trends
    const trends = await this.calculateWeeklyTrends(scans, weekDates);

    // Generate highlights
    const highlights = this.generateHighlights(summary, topRisks);

    // Build response
    const insights: WeeklyInsightsResponseDto = {
      week: {
        startDate: weekDates.startDate.toISOString(),
        endDate: weekDates.endDate.toISOString(),
        weekNumber: this.getWeekNumber(weekDates.startDate),
      },
      summary,
      highlights,
      topRisks,
      recommendations,
      trends,
    };

    // Cache for 1 hour
    await this.redisService.set(cacheKey, insights, 3600);

    return insights;
  }

  /**
   * Get monthly insights
   */
  async getMonthlyInsights(
    userId: string,
    deviceId?: string,
    month?: string,
    includeRecommendations = true,
    forceRefresh = false,
  ): Promise<MonthlyInsightsResponseDto> {
    // Check Redis cache first (skip if forceRefresh is true)
    const cacheKey = `insights:monthly:${userId}:${deviceId || 'all'}:${
      month || 'current'
    }`;

    if (!forceRefresh) {
      const cached =
        await this.redisService.get<MonthlyInsightsResponseDto>(cacheKey);
      if (cached) {
        this.logger.debug(`Cache hit for monthly insights: ${cacheKey}`);
        return cached;
      }
    } else {
      this.logger.debug(
        `Force refresh requested for monthly insights: ${cacheKey}`,
      );
    }

    // Calculate date range for the month
    const monthDates = this.calculateMonthRange(month);

    // Fetch scan data for the month
    const scans = await this.getScansByDateRange(
      userId,
      deviceId,
      monthDates.startDate,
      monthDates.endDate,
    );

    // Get previous month for comparison
    const previousMonthDates = this.getPreviousMonth(monthDates.startDate);
    const previousScans = await this.getScansByDateRange(
      userId,
      deviceId,
      previousMonthDates.startDate,
      previousMonthDates.endDate,
    );

    // Calculate summary statistics
    const summary = await this.calculateMonthlySummary(
      scans,
      previousScans,
      monthDates,
    );

    // Get top risks
    const topRisks = await this.getTopRisks(scans, 10);

    // Get AI recommendations (if requested)
    let recommendations: RecommendationDto[] = [];
    if (includeRecommendations) {
      recommendations = await this.generateRecommendations(
        userId,
        deviceId,
        scans,
        10,
      );
    }

    // Calculate trends
    const trends = await this.calculateMonthlyTrends(scans, monthDates);

    // Generate highlights
    const highlights = this.generateHighlights(summary, topRisks);

    // Generate achievements
    const achievements = this.generateAchievements(scans, summary);

    // Build response
    const insights: MonthlyInsightsResponseDto = {
      month: {
        year: monthDates.startDate.getFullYear(),
        month: monthDates.startDate.getMonth() + 1,
        startDate: monthDates.startDate.toISOString(),
        endDate: monthDates.endDate.toISOString(),
      },
      summary,
      highlights,
      topRisks,
      recommendations,
      trends,
      achievements,
    };

    // Cache for 6 hours
    await this.redisService.set(cacheKey, insights, 21600);

    return insights;
  }

  /**
   * Get security recommendations
   */
  async getRecommendations(
    userId: string,
    deviceId?: string,
    limit = 10,
    priority?: 'high' | 'medium' | 'low' | 'all',
    category?: string,
  ): Promise<RecommendationsResponseDto> {
    // Get recent scans (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const scans = await this.getScansByDateRange(
      userId,
      deviceId,
      thirtyDaysAgo,
      new Date(),
    );

    // Generate recommendations
    let recommendations = await this.generateRecommendations(
      userId,
      deviceId,
      scans,
      limit * 2, // Get more to filter
    );

    // Filter by priority
    if (priority && priority !== 'all') {
      recommendations = recommendations.filter((r) => r.priority === priority);
    }

    // Filter by category
    if (category) {
      recommendations = recommendations.filter(
        (r) => r.category.toLowerCase() === category.toLowerCase(),
      );
    }

    // Limit results
    recommendations = recommendations.slice(0, limit);

    // Calculate summary
    const summary: RecommendationsSummaryDto = {
      total: recommendations.length,
      high: recommendations.filter((r) => r.priority === 'high').length,
      medium: recommendations.filter((r) => r.priority === 'medium').length,
      low: recommendations.filter((r) => r.priority === 'low').length,
    };

    return {
      recommendations: recommendations.map((r, index) => ({
        id: `rec_${Date.now()}_${index}`,
        ...r,
        generatedAt: new Date().toISOString(),
      })),
      summary,
    };
  }

  /**
   * Get insights for a specific period (used by reports)
   */
  async getInsightsForPeriod(
    userId: string,
    deviceId: string | undefined,
    startDate: Date,
    endDate: Date,
    includeRecommendations = true,
  ) {
    const scans = await this.getScansByDateRange(
      userId,
      deviceId,
      startDate,
      endDate,
    );

    const summary = await this.calculateSummary(scans, startDate, endDate);
    const topRisks = await this.getTopRisks(scans, 10);
    const trends = await this.calculateTrends(scans, startDate, endDate);

    let recommendations: RecommendationDto[] = [];
    if (includeRecommendations) {
      recommendations = await this.generateRecommendations(
        userId,
        deviceId,
        scans,
        10,
      );
    }

    return {
      summary,
      topRisks,
      trends,
      recommendations,
    };
  }

  // ========== PRIVATE HELPER METHODS ==========

  /**
   * Get scans by date range
   */
  private async getScansByDateRange(
    userId: string,
    deviceId: string | undefined,
    startDate: Date,
    endDate: Date,
  ): Promise<any[]> {
    const filter: any = {
      userHash: userId,
      createdAt: {
        $gte: startDate,
        $lte: endDate,
      },
    };

    // Note: deviceId filtering would require device association in scans
    // For now, we'll filter by userHash only

    const scans = await this.scanModel
      .find(filter)
      .sort({ createdAt: 1 })
      .lean()
      .exec();

    return scans;
  }

  /**
   * Calculate weekly summary
   */
  private async calculateWeeklySummary(
    scans: any[],
    previousScans: any[],
    weekDates: { startDate: Date; endDate: Date },
  ): Promise<WeeklySummaryDto> {
    const currentScores = scans
      .map((s) => s.summary?.avgScore || s.score || 0)
      .filter((s) => s > 0);
    const previousScores = previousScans
      .map((s) => s.summary?.avgScore || s.score || 0)
      .filter((s) => s > 0);

    const currentScore =
      currentScores.length > 0
        ? Math.round(
            currentScores.reduce((a, b) => a + b, 0) / currentScores.length,
          )
        : 0;
    const previousScore =
      previousScores.length > 0
        ? Math.round(
            previousScores.reduce((a, b) => a + b, 0) / previousScores.length,
          )
        : currentScore;

    const change = currentScore - previousScore;
    const trend: 'up' | 'down' | 'stable' =
      change > 2 ? 'up' : change < -2 ? 'down' : 'stable';

    // Calculate new/resolved risks (simplified - compare app lists)
    const currentApps = new Set(
      scans.flatMap((s) =>
        (s.report?.results || []).map((r: any) => r.packageName),
      ),
    );
    const previousApps = new Set(
      previousScans.flatMap((s) =>
        (s.report?.results || []).map((r: any) => r.packageName),
      ),
    );

    const newApps = Array.from(currentApps).filter(
      (app) => !previousApps.has(app),
    );
    const removedApps = Array.from(previousApps).filter(
      (app) => !currentApps.has(app),
    );

    // Count risky apps
    const riskyApps = scans.flatMap((s) =>
      (s.report?.results || []).filter(
        (r: any) =>
          r.riskLevel === 'high' ||
          r.riskLevel === 'critical' ||
          (r.score && r.score < 50),
      ),
    );

    return {
      privacyScore: {
        current: currentScore,
        previous: previousScore,
        change,
        trend,
      },
      scans: scans.length,
      newRisks: newApps.length,
      resolvedRisks: removedApps.length,
      appsScanned: currentApps.size,
    };
  }

  /**
   * Calculate monthly summary
   */
  private async calculateMonthlySummary(
    scans: any[],
    previousScans: any[],
    monthDates: { startDate: Date; endDate: Date },
  ): Promise<MonthlySummaryDto> {
    const weeklySummary = await this.calculateWeeklySummary(
      scans,
      previousScans,
      monthDates,
    );

    const weeksInMonth = Math.ceil(
      (monthDates.endDate.getTime() - monthDates.startDate.getTime()) /
        (7 * 24 * 60 * 60 * 1000),
    );
    const avgScanFrequency = `${Math.round(
      scans.length / Math.max(weeksInMonth, 1),
    )} per week`;

    return {
      ...weeklySummary,
      averageScanFrequency: avgScanFrequency,
    };
  }

  /**
   * Calculate general summary
   */
  private async calculateSummary(scans: any[], startDate: Date, endDate: Date) {
    const scores = scans
      .map((s) => s.summary?.avgScore || s.score || 0)
      .filter((s) => s > 0);

    const avgScore =
      scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : 0;
    const currentScore = scores.length > 0 ? scores[scores.length - 1] : 0;

    const allApps = new Set(
      scans.flatMap((s) =>
        (s.report?.results || []).map((r: any) => r.packageName),
      ),
    );

    const riskyApps = scans.flatMap((s) =>
      (s.report?.results || []).filter(
        (r: any) =>
          r.riskLevel === 'high' ||
          r.riskLevel === 'critical' ||
          (r.score && r.score < 50),
      ),
    );

    return {
      privacyScore: {
        current: currentScore,
        average: avgScore,
        change: currentScore - avgScore,
        trend:
          currentScore > avgScore + 2
            ? 'up'
            : currentScore < avgScore - 2
              ? 'down'
              : 'stable',
      },
      scans: {
        total: scans.length,
        averagePerWeek: Math.round(scans.length / 4),
      },
      risks: {
        newRisks: 0, // Would need comparison logic
        resolvedRisks: 0,
        currentRisks: riskyApps.length,
      },
      apps: {
        totalScanned: allApps.size,
        riskyApps: riskyApps.length,
        safeApps: allApps.size - riskyApps.length,
        newApps: 0,
        removedApps: 0,
      },
    };
  }

  /**
   * Get top risks from scans
   */
  private async getTopRisks(
    scans: any[],
    limit: number,
  ): Promise<TopRiskDto[]> {
    const riskMap = new Map<string, any>();

    scans.forEach((scan) => {
      (scan.report?.results || []).forEach((result: any) => {
        if (
          result.riskLevel === 'high' ||
          result.riskLevel === 'critical' ||
          (result.score && result.score < 50)
        ) {
          const key = result.packageName;
          if (!riskMap.has(key)) {
            riskMap.set(key, {
              appName: result.name || result.packageName,
              packageName: result.packageName,
              riskLevel: result.riskLevel || 'medium',
              description: this.generateRiskDescription(result),
              firstDetected: scan.createdAt || new Date(),
              count: 0,
            });
          }
          riskMap.get(key).count++;
        }
      });
    });

    return Array.from(riskMap.values())
      .sort((a, b) => {
        // Sort by risk level priority, then by count
        const riskOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        const aRisk = riskOrder[a.riskLevel] || 0;
        const bRisk = riskOrder[b.riskLevel] || 0;
        if (aRisk !== bRisk) return bRisk - aRisk;
        return b.count - a.count;
      })
      .slice(0, limit)
      .map((risk) => ({
        appName: risk.appName,
        packageName: risk.packageName,
        riskLevel: risk.riskLevel,
        description: risk.description,
        firstDetected: (risk.firstDetected as Date).toISOString(),
      }));
  }

  /**
   * Generate risk description
   */
  private generateRiskDescription(result: any): string {
    const reasons: string[] = [];

    if (result.permissions?.list?.length > 10) {
      reasons.push('Excessive permissions');
    }
    if (result.trackers?.length > 0) {
      reasons.push(`${result.trackers.length} tracking libraries detected`);
    }
    if (result.score && result.score < 30) {
      reasons.push('Very low privacy score');
    }
    if (result.riskLevel === 'critical' || result.riskLevel === 'high') {
      reasons.push('High risk level detected');
    }

    return reasons.length > 0
      ? reasons.join(', ')
      : 'Multiple privacy concerns detected';
  }

  /**
   * Generate AI-powered recommendations
   */
  private async generateRecommendations(
    userId: string,
    deviceId: string | undefined,
    scans: any[],
    limit: number,
  ): Promise<RecommendationDto[]> {
    try {
      // Analyze scan data to identify issues
      const issues = this.analyzeSecurityIssues(scans);

      // Build prompt for AI
      const prompt = this.buildRecommendationPrompt(issues);

      // Use AI to generate recommendations
      const userDataSummary = {
        userId,
        totalScans: scans.length,
        riskyApps: issues.riskyAppsCount,
        highRiskApps: issues.highRiskAppsCount,
        totalApps: issues.totalApps,
        permissionStats: issues.permissionStats,
      };

      const aiResult =
        await this.aiTipGenerator.generatePersonalizedTips(userDataSummary);

      // Parse AI recommendations
      const recommendations = this.parseAIRecommendations(
        aiResult.tips,
        issues,
      );

      // Prioritize and limit
      return this.prioritizeRecommendations(recommendations).slice(0, limit);
    } catch (error) {
      this.logger.error('Failed to generate AI recommendations', error);
      // Return fallback recommendations
      return this.generateFallbackRecommendations(scans, limit);
    }
  }

  /**
   * Analyze security issues from scans
   */
  private analyzeSecurityIssues(scans: any[]) {
    const permissionStats: Record<string, number> = {};
    const riskyApps: any[] = [];
    let totalApps = 0;

    scans.forEach((scan) => {
      (scan.report?.results || []).forEach((result: any) => {
        totalApps++;
        if (
          result.riskLevel === 'high' ||
          result.riskLevel === 'critical' ||
          (result.score && result.score < 50)
        ) {
          riskyApps.push(result);
        }

        // Count permissions
        (result.permissions?.list || []).forEach((perm: string) => {
          permissionStats[perm] = (permissionStats[perm] || 0) + 1;
        });
      });
    });

    return {
      permissionStats,
      riskyApps,
      riskyAppsCount: riskyApps.length,
      highRiskAppsCount: riskyApps.filter(
        (r) => r.riskLevel === 'high' || r.riskLevel === 'critical',
      ).length,
      totalApps,
    };
  }

  /**
   * Build recommendation prompt for AI
   */
  private buildRecommendationPrompt(issues: any): string {
    return `Analyze the following security scan data and provide actionable recommendations in JSON format:
    
Total Apps Scanned: ${issues.totalApps}
Risky Apps: ${issues.riskyAppsCount}
High Risk Apps: ${issues.highRiskAppsCount}
Top Permissions: ${JSON.stringify(
      (Object.entries(issues.permissionStats) as [string, number][])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10),
    )}

Provide recommendations with priority (high/medium/low), category, title, description, and impact.`;
  }

  /**
   * Parse AI recommendations
   */
  private parseAIRecommendations(
    aiTips: any[],
    issues: any,
  ): RecommendationDto[] {
    return aiTips.map((tip) => ({
      priority: (tip.priority || 'medium') as 'high' | 'medium' | 'low',
      category: tip.category || 'general',
      title: tip.title || tip.recommendation || 'Security Recommendation',
      description: tip.content || tip.description || '',
      actionUrl: `/permissions?filter=${tip.category || 'all'}`,
      impact: {
        privacyScoreIncrease:
          tip.priority === 'high' ? 5 : tip.priority === 'medium' ? 3 : 1,
        privacyImprovement:
          tip.priority === 'high'
            ? 'High'
            : tip.priority === 'medium'
              ? 'Medium'
              : 'Low',
      },
    }));
  }

  /**
   * Prioritize recommendations
   */
  private prioritizeRecommendations(
    recommendations: RecommendationDto[],
  ): RecommendationDto[] {
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    return recommendations.sort(
      (a, b) =>
        (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0),
    );
  }

  /**
   * Generate fallback recommendations
   */
  private generateFallbackRecommendations(
    scans: any[],
    limit: number,
  ): RecommendationDto[] {
    const recommendations: RecommendationDto[] = [];

    const issues = this.analyzeSecurityIssues(scans);

    if (issues.riskyAppsCount > 0) {
      recommendations.push({
        priority: 'high',
        category: 'apps',
        title: 'Review Risky Apps',
        description: `You have ${issues.riskyAppsCount} apps with privacy concerns. Review and consider removing unnecessary apps.`,
        actionUrl: '/apps?filter=risky',
        impact: {
          privacyScoreIncrease: 5,
          privacyImprovement: 'High',
        },
      });
    }

    const topPermission = (
      Object.entries(issues.permissionStats) as [string, number][]
    ).sort((a, b) => b[1] - a[1])[0];

    if (topPermission && topPermission[1] > 5) {
      recommendations.push({
        priority: 'medium',
        category: 'permissions',
        title: `Review ${topPermission[0]} Permission`,
        description: `${topPermission[1]} apps are using this permission. Review if all apps need it.`,
        actionUrl: `/permissions?filter=${topPermission[0]}`,
        impact: {
          privacyScoreIncrease: 3,
          privacyImprovement: 'Medium',
        },
      });
    }

    return recommendations.slice(0, limit);
  }

  /**
   * Calculate weekly trends
   */
  private async calculateWeeklyTrends(
    scans: any[],
    weekDates: { startDate: Date; endDate: Date },
  ): Promise<WeeklyTrendsDto> {
    const dailyData = new Map<string, { score: number; riskCount: number }>();

    // Initialize all days in week
    for (let i = 0; i < 7; i++) {
      const date = new Date(weekDates.startDate);
      date.setDate(date.getDate() + i);
      const dateKey = date.toISOString().split('T')[0];
      dailyData.set(dateKey, { score: 0, riskCount: 0 });
    }

    // Aggregate scan data by day
    scans.forEach((scan) => {
      const dateKey = (scan.createdAt as Date).toISOString().split('T')[0];
      if (dailyData.has(dateKey)) {
        const data = dailyData.get(dateKey)!;
        const score = scan.summary?.avgScore || scan.score || 0;
        if (score > 0) {
          data.score = score;
        }

        const riskyCount = (scan.report?.results || []).filter(
          (r: any) =>
            r.riskLevel === 'high' ||
            r.riskLevel === 'critical' ||
            (r.score && r.score < 50),
        ).length;
        data.riskCount = riskyCount;
      }
    });

    const privacyScore = Array.from(dailyData.entries()).map(
      ([date, data]) => ({
        date,
        score: data.score,
      }),
    );

    const riskCount = Array.from(dailyData.entries()).map(([date, data]) => ({
      date,
      count: data.riskCount,
    }));

    return { privacyScore, riskCount };
  }

  /**
   * Calculate monthly trends
   */
  private async calculateMonthlyTrends(
    scans: any[],
    monthDates: { startDate: Date; endDate: Date },
  ): Promise<MonthlyTrendsDto> {
    const weeklyData: Array<{ date: string; score: number }> = [];
    const riskDistribution = { high: 0, medium: 0, low: 0, safe: 0 };

    // Group scans by week
    const weeks = Math.ceil(
      (monthDates.endDate.getTime() - monthDates.startDate.getTime()) /
        (7 * 24 * 60 * 60 * 1000),
    );

    for (let week = 0; week < weeks; week++) {
      const weekStart = new Date(monthDates.startDate);
      weekStart.setDate(weekStart.getDate() + week * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      const weekScans = scans.filter(
        (s) => s.createdAt >= weekStart && s.createdAt <= weekEnd,
      );

      if (weekScans.length > 0) {
        const avgScore =
          weekScans.reduce(
            (sum, s) => sum + (s.summary?.avgScore || s.score || 0),
            0,
          ) / weekScans.length;

        weeklyData.push({
          date: weekStart.toISOString().split('T')[0],
          score: Math.round(avgScore),
        });
      }
    }

    // Calculate risk distribution
    scans.forEach((scan) => {
      (scan.report?.results || []).forEach((result: any) => {
        if (result.riskLevel === 'high' || result.riskLevel === 'critical') {
          riskDistribution.high++;
        } else if (result.riskLevel === 'medium') {
          riskDistribution.medium++;
        } else if (result.riskLevel === 'low') {
          riskDistribution.low++;
        } else {
          riskDistribution.safe++;
        }
      });
    });

    return {
      privacyScore: weeklyData,
      riskDistribution,
    };
  }

  /**
   * Calculate general trends
   */
  private async calculateTrends(scans: any[], startDate: Date, endDate: Date) {
    const weeklyTrends = await this.calculateMonthlyTrends(scans, {
      startDate,
      endDate,
    });

    return {
      privacyScore: weeklyTrends.privacyScore,
      riskDistribution: weeklyTrends.riskDistribution,
    };
  }

  /**
   * Generate highlights
   */
  private generateHighlights(
    summary: WeeklySummaryDto | MonthlySummaryDto,
    topRisks: TopRiskDto[],
  ): HighlightDto[] {
    const highlights: HighlightDto[] = [];

    if (summary.privacyScore.trend === 'up') {
      highlights.push({
        type: 'improvement',
        title: 'Privacy Score Improved',
        description: `Your privacy score ${summary.privacyScore.change > 0 ? 'increased' : 'decreased'} by ${Math.abs(summary.privacyScore.change)} points`,
        icon: 'trending-up',
      });
    }

    if ('newRisks' in summary && summary.newRisks > 0) {
      highlights.push({
        type: 'warning',
        title: 'New Risks Detected',
        description: `${summary.newRisks} new ${summary.newRisks === 1 ? 'risk' : 'risks'} ${summary.newRisks === 1 ? 'was' : 'were'} detected`,
        icon: 'alert-triangle',
      });
    }

    if (topRisks.length > 0 && topRisks[0].riskLevel === 'high') {
      highlights.push({
        type: 'warning',
        title: 'High Risk App Detected',
        description: `${topRisks[0].appName} has high risk permissions`,
        icon: 'shield-alert',
      });
    }

    return highlights;
  }

  /**
   * Generate achievements
   */
  private generateAchievements(
    scans: any[],
    summary: MonthlySummaryDto,
  ): AchievementDto[] {
    const achievements: AchievementDto[] = [];

    if (scans.length >= 10) {
      achievements.push({
        title: 'Consistent Scanner',
        description: `Scanned your device ${scans.length} times this month`,
        icon: 'award',
      });
    }

    if (
      summary.privacyScore.trend === 'up' &&
      summary.privacyScore.change >= 5
    ) {
      achievements.push({
        title: 'Privacy Champion',
        description: 'Significantly improved your privacy score',
        icon: 'shield-check',
      });
    }

    if ('resolvedRisks' in summary && summary.resolvedRisks >= 5) {
      achievements.push({
        title: 'Risk Resolver',
        description: `Resolved ${summary.resolvedRisks} privacy risks`,
        icon: 'check-circle',
      });
    }

    return achievements;
  }

  /**
   * Calculate week date range
   */
  private calculateWeekRange(week?: string): {
    startDate: Date;
    endDate: Date;
  } {
    const date = week ? new Date(week) : new Date();
    const dayOfWeek = date.getDay();
    const startDate = new Date(date);
    startDate.setDate(date.getDate() - dayOfWeek);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
    endDate.setHours(23, 59, 59, 999);

    return { startDate, endDate };
  }

  /**
   * Get previous week
   */
  private getPreviousWeek(date: Date): { startDate: Date; endDate: Date } {
    const prevDate = new Date(date);
    prevDate.setDate(prevDate.getDate() - 7);
    return this.calculateWeekRange(prevDate.toISOString());
  }

  /**
   * Calculate month date range
   */
  private calculateMonthRange(month?: string): {
    startDate: Date;
    endDate: Date;
  } {
    let date: Date;
    if (month) {
      const [year, monthNum] = month.split('-').map(Number);
      date = new Date(year, monthNum - 1, 1);
    } else {
      date = new Date();
    }

    const startDate = new Date(date.getFullYear(), date.getMonth(), 1);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    endDate.setHours(23, 59, 59, 999);

    return { startDate, endDate };
  }

  /**
   * Get previous month
   */
  private getPreviousMonth(date: Date): { startDate: Date; endDate: Date } {
    const prevDate = new Date(date);
    prevDate.setMonth(prevDate.getMonth() - 1);
    return this.calculateMonthRange(
      `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`,
    );
  }

  /**
   * Get week number
   */
  private getWeekNumber(date: Date): number {
    const d = new Date(
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
    );
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  }

  /**
   * Invalidate insights cache for a user/device
   * Called after a new scan is completed
   */
  async invalidateInsightsCache(
    userId: string,
    deviceId?: string,
  ): Promise<void> {
    try {
      this.logger.debug(
        `Invalidating insights cache for user: ${userId}, device: ${deviceId || 'all'}`,
      );

      // Patterns to invalidate
      const patterns: string[] = [
        `insights:weekly:${userId}:all:*`,
        `insights:monthly:${userId}:all:*`,
        `insights:recommendations:${userId}:all:*`,
      ];

      if (deviceId) {
        patterns.push(
          `insights:weekly:${userId}:${deviceId}:*`,
          `insights:monthly:${userId}:${deviceId}:*`,
          `insights:recommendations:${userId}:${deviceId}:*`,
        );
      }

      // Delete all matching keys
      let deletedCount = 0;
      for (const pattern of patterns) {
        const keys = await this.redisService.keys(pattern);
        if (keys.length > 0) {
          await this.redisService.del(...keys);
          deletedCount += keys.length;
          this.logger.debug(
            `Deleted ${keys.length} keys matching pattern: ${pattern}`,
          );
        }
      }

      this.logger.log(
        `✅ Invalidated ${deletedCount} insights cache keys for user: ${userId}`,
      );
    } catch (error) {
      this.logger.error('Failed to invalidate insights cache', error);
      // Don't throw - cache invalidation failure shouldn't break the scan
    }
  }
}
