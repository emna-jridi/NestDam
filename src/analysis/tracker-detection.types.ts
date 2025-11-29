export interface TrackerAnalysis {
  id: number;
  name: string;
  website?: string;
  categories: string[];
  privacyImpact: number;
  description?: string;
  company?: string;
  category?: string;
  isKnown?: boolean;
}

export interface TrackerDetectionResult {
  totalTrackers: number;
  knownTrackers: TrackerAnalysis[];
  unknownTrackers: number[];
  categories: Record<string, number>;
  totalPrivacyImpact: number;
  riskScore: number;
}
