import { Injectable, Logger } from '@nestjs/common';
import { ComparisonResultDto } from '../dto/compare-scans.dto';

@Injectable()
export class ScanComparisonService {
  private readonly logger = new Logger(ScanComparisonService.name);

  /**
   * Compare deux scans
   */
  compare(scan1: any, scan2: any): ComparisonResultDto {
    // ✅ CORRECTION : Typage explicite
    const packages1 = new Set<string>(
      scan1.report.results.map((r: any) => String(r.packageName)),
    );
    const packages2 = new Set<string>(
      scan2.report.results.map((r: any) => String(r.packageName)),
    );

    // ✅ CORRECTION : Typage explicite avec Array.from()
    const newApps: string[] = Array.from(packages2).filter(
      (p: string) => !packages1.has(p),
    );
    const removedApps: string[] = Array.from(packages1).filter(
      (p: string) => !packages2.has(p),
    );
    const unchangedApps: string[] = Array.from(packages1).filter((p: string) =>
      packages2.has(p),
    );

    const scoreChanges = this.calculateScoreChanges(
      scan1.report.results,
      scan2.report.results,
      unchangedApps,
    );

    const avgScoreChange =
      scoreChanges.length > 0
        ? scoreChanges.reduce((sum, c) => sum + c.change, 0) /
          scoreChanges.length
        : 0;

    return {
      scan1: this.formatScanInfo(scan1),
      scan2: this.formatScanInfo(scan2),
      differences: {
        newApps,
        removedApps,
        unchangedApps,
        scoreChanges,
      },
      summary: {
        totalChanges:
          newApps.length + removedApps.length + scoreChanges.length,
        appsAdded: newApps.length,
        appsRemoved: removedApps.length,
        avgScoreChange: Math.round(avgScoreChange),
      },
    };
  }

  /**
   * Calcule les changements de score entre deux scans
   */
  private calculateScoreChanges(
    results1: any[],
    results2: any[],
    unchangedApps: string[],
  ) {
    const scoreChanges: Array<{
      packageName: string;
      name: string;
      oldScore: number;
      newScore: number;
      change: number;
    }> = [];

    for (const pkg of unchangedApps) {
      const app1 = results1.find((r: any) => r.packageName === pkg);
      const app2 = results2.find((r: any) => r.packageName === pkg);

      if (app1 && app2 && app1.score !== app2.score) {
        scoreChanges.push({
          packageName: pkg,
          name: app2.name || 'Unknown',
          oldScore: app1.score || 0,
          newScore: app2.score || 0,
          change: (app2.score || 0) - (app1.score || 0),
        });
      }
    }

    return scoreChanges.sort(
      (a, b) => Math.abs(b.change) - Math.abs(a.change),
    );
  }

  /**
   * Formate les infos d'un scan pour la comparaison
   */
  private formatScanInfo(scan: any) {
    return {
      scanId: scan._id.toString(),
      scanDate: scan.createdAt || new Date(),
      totalApps: scan.totalApps || 0,
      avgScore: scan.summary?.avgScore || 0,
    };
  }
}