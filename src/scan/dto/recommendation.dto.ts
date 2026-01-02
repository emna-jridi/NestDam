export class RecommendationDto {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  category: 'MALWARE' | 'PRIVACY' | 'PERMISSION' | 'TRACKER' | 'CODE_QUALITY' | 'GENERAL';
  title: string;
  description: string;
  action: string; // Human-readable action
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  sortPriority: number; // Higher = more important
  relatedFindings?: string[];
}
