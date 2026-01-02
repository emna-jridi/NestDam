import { Injectable, Logger } from '@nestjs/common';
import { RecommendationDto } from '../dto';

@Injectable()
export class RecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);

  /**
   * Generate recommendations based on scan results
   */
  generateRecommendations(scanResult: any): RecommendationDto[] {
    const recommendations: RecommendationDto[] = [];

    // Malware recommendations
    if (scanResult.ml && scanResult.ml.riskLevel === 'CRITICAL') {
      recommendations.push({
        severity: 'CRITICAL',
        category: 'MALWARE',
        title: 'High Malware Risk Detected',
        description: 'This app has a very high probability of containing malicious code.',
        action: 'Uninstall this app immediately',
        impact: 'HIGH',
        sortPriority: 100,
        relatedFindings: ['ML Model: CRITICAL risk'],
      });
    } else if (scanResult.ml && scanResult.ml.riskLevel === 'HIGH') {
      recommendations.push({
        severity: 'HIGH',
        category: 'MALWARE',
        title: 'Suspicious App Behavior',
        description: 'This app shows suspicious patterns that may indicate malicious activity.',
        action: 'Review and consider uninstalling',
        impact: 'HIGH',
        sortPriority: 90,
        relatedFindings: ['ML Model: HIGH risk'],
      });
    }

    // Privacy recommendations - trackers
    if (scanResult.trackers) {
      const { totalFound, categories } = scanResult.trackers;

      if (categories.advertising > 3) {
        recommendations.push({
          severity: 'HIGH',
          category: 'TRACKER',
          title: 'Excessive Advertising Trackers',
          description: `This app contains ${categories.advertising} advertising trackers that may collect your data for targeted ads.`,
          action: 'Consider using an ad-blocking solution or switching to an alternative app',
          impact: 'MEDIUM',
          sortPriority: 80,
          relatedFindings: [`${categories.advertising} advertising trackers`],
        });
      }

      if (categories.location > 0) {
        recommendations.push({
          severity: 'CRITICAL',
          category: 'PRIVACY',
          title: 'Location Tracking Detected',
          description: `This app contains ${categories.location} location tracking services.`,
          action: 'Disable location permission in app settings',
          impact: 'HIGH',
          sortPriority: 95,
          relatedFindings: [`${categories.location} location trackers`],
        });
      }

      if (categories.analytics > 2) {
        recommendations.push({
          severity: 'MEDIUM',
          category: 'TRACKER',
          title: 'Multiple Analytics Trackers',
          description: `This app contains ${categories.analytics} analytics trackers for user behavior monitoring.`,
          action: 'Review privacy settings and consider disabling analytics',
          impact: 'MEDIUM',
          sortPriority: 70,
          relatedFindings: [`${categories.analytics} analytics trackers`],
        });
      }
    }

    // Permission-based recommendations
    if (scanResult.ml && scanResult.ml.topContributingFeatures) {
      for (const feature of scanResult.ml.topContributingFeatures) {
        if (feature.name === 'has_camera' && feature.value === 1) {
          recommendations.push({
            severity: 'MEDIUM',
            category: 'PERMISSION',
            title: 'Camera Permission',
            description: 'This app requests camera access. Ensure this is necessary for its functionality.',
            action: 'Review camera permission usage in settings',
            impact: 'MEDIUM',
            sortPriority: 60,
            relatedFindings: ['Camera permission requested'],
          });
        }

        if (feature.name === 'has_sms' && feature.value === 1) {
          recommendations.push({
            severity: 'HIGH',
            category: 'PERMISSION',
            title: 'SMS Access Permission',
            description: 'This app can read and send SMS messages. This is a high-risk permission.',
            action: 'Revoke SMS permissions if not essential',
            impact: 'HIGH',
            sortPriority: 85,
            relatedFindings: ['SMS permission requested'],
          });
        }

        if (feature.name === 'dangerous_permissions_count' && feature.value > 0.5) {
          recommendations.push({
            severity: 'HIGH',
            category: 'PERMISSION',
            title: 'Multiple Dangerous Permissions',
            description: `This app requests ${Math.round(feature.value * 20)} dangerous permissions that access sensitive data.`,
            action: 'Review each permission and disable unnecessary ones',
            impact: 'HIGH',
            sortPriority: 75,
            relatedFindings: ['Multiple dangerous permissions'],
          });
        }
      }
    }

    // SAAT recommendations
    if (scanResult.saat) {
      if (scanResult.saat.dynamicCodeLoading && !scanResult.saat.dynamicCodeLoading.passed) {
        recommendations.push({
          severity: 'CRITICAL',
          category: 'CODE_QUALITY',
          title: 'Dynamic Code Injection Detected',
          description: 'This app uses dynamic code loading, which could be used to inject malicious code.',
          action: 'Proceed with caution and monitor app behavior',
          impact: 'HIGH',
          sortPriority: 92,
          relatedFindings: ['DexClassLoader usage'],
        });
      }

      if (scanResult.saat.weakCrypto && !scanResult.saat.weakCrypto.passed) {
        recommendations.push({
          severity: 'HIGH',
          category: 'CODE_QUALITY',
          title: 'Weak Cryptography Detected',
          description: 'This app uses outdated or weak cryptographic algorithms.',
          action: 'Be cautious when sharing sensitive data through this app',
          impact: 'MEDIUM',
          sortPriority: 65,
          relatedFindings: ['Weak crypto algorithms used'],
        });
      }

      if (scanResult.saat.obfuscation && !scanResult.saat.obfuscation.passed) {
        recommendations.push({
          severity: 'MEDIUM',
          category: 'CODE_QUALITY',
          title: 'Code Obfuscation Detected',
          description: 'This app has heavy code obfuscation, making it difficult to analyze.',
          action: 'Exercise extra caution with this app',
          impact: 'LOW',
          sortPriority: 55,
          relatedFindings: ['Code obfuscation detected'],
        });
      }
    }

    // Sort by priority
    recommendations.sort((a, b) => b.sortPriority - a.sortPriority);

    return recommendations;
  }

  /**
   * Get recommendation severity count
   */
  getRecommendationSummary(recommendations: RecommendationDto[]): {
    critical: number;
    high: number;
    medium: number;
    low: number;
  } {
    return {
      critical: recommendations.filter((r) => r.severity === 'CRITICAL').length,
      high: recommendations.filter((r) => r.severity === 'HIGH').length,
      medium: recommendations.filter((r) => r.severity === 'MEDIUM').length,
      low: recommendations.filter((r) => r.severity === 'LOW').length,
    };
  }
}
