export class PermissionsInfoDto {
  dangerous: string[];
  total: number;
}

export class TrackersInfoDto {
  total: number;
  list: string[];
}

export class FlagsInfoDto {
  isDebuggable?: boolean;
  hasUnknownTrackers?: boolean;
}

export class AlternativeAppDto {
  name: string;
  packageName: string;
  privacyScore: number;
  improvement: number;
}

export class AppStatsDto {
  totalScans: number;
  avgScoreFromCommunity?: number;
  lastScanned?: string;
}

export class AppDetailsDto {
  packageName: string;
  name: string;
  developer: string;
  category: string;
  version: string;
  iconUrl: string;
  description: string;

  // Scores
  privacyScore: number;
  riskLevel: string;
  riskColor: string;
  communityScore: number;

  // Security details
  permissions?: PermissionsInfoDto;
  trackers?: TrackersInfoDto;
  flags?: FlagsInfoDto;
  recommendations?: string[];
  alternatives?: AlternativeAppDto[];
  stats?: AppStatsDto | null;
}