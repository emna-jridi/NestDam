import { IsNotEmpty, IsString } from 'class-validator';

export class ComparScansDto {
  @IsNotEmpty()
  @IsString()
  scanId1: string;

  @IsNotEmpty()
  @IsString()
  scanId2: string;
}

export class ComparisonResultDto {
  scan1: {
    scanId: string;
    scanDate: Date;
    totalApps: number;
    avgScore: number;
  };
  scan2: {
    scanId: string;
    scanDate: Date;
    totalApps: number;
    avgScore: number;
  };
  differences: {
    newApps: string[];
    removedApps: string[];
    unchangedApps: string[];
    scoreChanges: Array<{
      packageName: string;
      name: string;
      oldScore: number;
      newScore: number;
      change: number;
    }>;
  };
  summary: {
    totalChanges: number;
    appsAdded: number;
    appsRemoved: number;
    avgScoreChange: number;
  };
}