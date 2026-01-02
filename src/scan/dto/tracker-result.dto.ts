export class Tracker {
  id: string;
  name: string;
  category: 'Advertising' | 'Analytics' | 'Cross-app' | 'Location';
  found: boolean;
  packageNames?: string[];
  domains?: string[];
}

export class TrackerResultDto {
  totalFound: number;
  categories: {
    advertising: number;
    analytics: number;
    crossapp: number;
    location: number;
  };
  trackers: Tracker[];
  privacyScore: number; // 0-100
  apiUsed: 'exodus' | 'local' | 'fallback';
  cachingStatus: 'cached' | 'fresh';
}
