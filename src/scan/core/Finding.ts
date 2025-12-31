export enum FindingSeverity {
  INFO = 'info',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum FindingCategory {
  SECURITY = 'security',
  PRIVACY = 'privacy',
  TRACKER = 'tracker',
  MALWARE = 'malware',
  CODE = 'code',
  NETWORK = 'network',
}

export interface Finding {
  id: string;                     // ex: TRACKER_FACEBOOK
  title: string;                  // "Facebook Tracker detected"
  description: string;            // explanation humaine
  severity: FindingSeverity;
  category: FindingCategory;
  confidence: number;             // 0 → 1
  evidence?: string[];             // classes, domains, permissions
  recommendation?: string;        // action user
}
