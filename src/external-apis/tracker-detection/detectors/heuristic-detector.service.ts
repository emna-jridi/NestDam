// src/external-apis/tracker-detection/detectors/heuristic-detector.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { EtipService } from '../../etip.service';
import { DetectedTracker } from '../interfaces/tracker-detection.interface';

@Injectable()
export class HeuristicDetectorService {
  private readonly logger = new Logger(HeuristicDetectorService.name);

  constructor(private readonly etipService: EtipService) {}

  async detectTrackers(packageName: string): Promise<DetectedTracker[]> {
    this.logger.debug(`Heuristic detection for ${packageName}`);

    const detected: DetectedTracker[] = [];
    const pkg = packageName.toLowerCase();
    const rules = this.getHeuristicRules();

    for (const rule of rules) {
      if (rule.condition(pkg)) {
        detected.push({
          name: rule.tracker,
          confidence: rule.confidence,
          reason: rule.reason,
        });
      }
    }

    this.logger.debug(
      `Heuristic found ${detected.length} trackers for ${packageName}`,
    );

    return detected;
  }

  private getHeuristicRules() {
    return [
      // Apps Facebook
      {
        condition: (pkg: string) => pkg.startsWith('com.facebook'),
        tracker: 'Facebook SDK',
        confidence: 85,
        reason: 'Facebook app package',
      },
      {
        condition: (pkg: string) => pkg.includes('facebook'),
        tracker: 'Facebook Analytics',
        confidence: 70,
        reason: 'Facebook-related package',
      },

      // Apps Google
      {
        condition: (pkg: string) => pkg.startsWith('com.google'),
        tracker: 'Google Analytics',
        confidence: 80,
        reason: 'Google app package',
      },
      {
        condition: (pkg: string) =>
          pkg.startsWith('com.google') || pkg.includes('gms'),
        tracker: 'Firebase Analytics',
        confidence: 75,
        reason: 'Google services detected',
      },

      // Advertising
      {
        condition: (pkg: string) => pkg.includes('ads') || pkg.includes('ad.'),
        tracker: 'AdMob',
        confidence: 70,
        reason: 'Advertising-related package',
      },

      // Social media
      {
        condition: (pkg: string) => pkg.includes('twitter'),
        tracker: 'Twitter SDK',
        confidence: 80,
        reason: 'Twitter-related package',
      },
      {
        condition: (pkg: string) => pkg.includes('instagram'),
        tracker: 'Instagram SDK',
        confidence: 80,
        reason: 'Instagram-related package',
      },

      // Analytics populaires
      {
        condition: (pkg: string) => pkg.includes('flurry'),
        tracker: 'Flurry Analytics',
        confidence: 85,
        reason: 'Flurry package detected',
      },
      {
        condition: (pkg: string) => pkg.includes('appsflyer'),
        tracker: 'AppsFlyer',
        confidence: 85,
        reason: 'AppsFlyer package detected',
      },
    ];
  }
}