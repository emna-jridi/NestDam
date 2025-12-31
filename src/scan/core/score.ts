export interface ScoreBreakdown {
  security: number; // malware / crypto / code
  privacy: number;  // trackers / permissions
  behavior: number; // ML / heuristics
}

export interface ScanScore {
  global: number; // 0 - 100
  level: 'safe' | 'warning' | 'danger' | 'critical';
  breakdown: ScoreBreakdown;
}
