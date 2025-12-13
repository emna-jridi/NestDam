import { PermissionDto, TrackerDto } from './app.dto';

export interface AnalysisResultDto {
  aiRiskScore: number;
  aiRiskLevel: 'low' | 'medium' | 'high' | 'critical';
  aiSummary: string;
  aiRecommendations: string[];
  permissions?: PermissionDto[];
  trackers?: TrackerDto[];
}

export interface AnalysisEnvelopeDto {
  apps: Record<string, AnalysisResultDto>;
  globalSummary: string;
  globalRecommendations: string[];
}
