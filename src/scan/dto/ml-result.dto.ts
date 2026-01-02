export class ContributingFeature {
  name: string;
  impact: number; // 0-1
  value: number;
  normalizedValue: number;
}

export class MLResultDto {
  malwareProbability: number; // 0-1
  confidenceLevel: number; // 0-1
  topContributingFeatures: ContributingFeature[];
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  modelVersion: string;
  inferenceTime: number; // ms
}
