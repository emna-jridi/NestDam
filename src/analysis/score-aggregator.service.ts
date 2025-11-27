import { Injectable, Logger } from '@nestjs/common';
import { CVEResult } from '../external-apis/services/cve-details.service';
import { VirusTotalResult } from '../external-apis/services/virustotal.service';
import { KoodousResult } from '../external-apis/services/koodous.service';
import { PlayStoreDetailsResult } from '../external-apis/play-store.service';

export interface MultiSourceData {
    cve?: CVEResult;
    virusTotal?: VirusTotalResult;
    koodous?: KoodousResult;
    etip?: {
        trackers: number;
        dangerousTrackers: string[];
    };

    playStore?: PlayStoreDetailsResult;

    permissions?: {
        total: number;
        dangerous: number;
    };
}

export interface AggregatedScore {
    finalScore: number;
    confidence: number;
    breakdown: {
        security: number;
        privacy: number;
        reputation: number;
    };
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    alerts: string[];
    sources: string[];
}

@Injectable()
export class ScoreAggregatorService {
    private readonly logger = new Logger(ScoreAggregatorService.name);

    /**
     * MAIN AGGREGATION
     */
    aggregateScore(data: MultiSourceData): AggregatedScore {
        const scores = {
            security: this.calculateSecurityScore(data),
            privacy: this.calculatePrivacyScore(data),
            reputation: this.calculateReputationScore(data),
        };

        const finalScore = Math.round(
            scores.security * 0.4 +
            scores.privacy * 0.35 +
            scores.reputation * 0.25,
        );

        return {
            finalScore,
            confidence: this.calculateConfidence(data),
            breakdown: scores,
            riskLevel: this.getRiskLevel(finalScore),
            alerts: this.generateAlerts(data, scores),
            sources: this.getActiveSources(data),
        };
    }


    private calculateSecurityScore(data: MultiSourceData): number {
        let score = 100;

        // CVE impact
        if (data.cve) {
            score -= data.cve.critical * 8;
            score -= data.cve.high * 4;
            score -= data.cve.medium * 2;
        }

        // VirusTotal impact
        if (data.virusTotal) {
            if (data.virusTotal.verdict === 'malicious') score -= 60;
            else if (data.virusTotal.verdict === 'suspicious') score -= 30;
            else score = (score + data.virusTotal.reputation) / 2;
        }

        // Koodous impact
        if (data.koodous && data.koodous.analyzed) {
            if (data.koodous.detected) score -= 50;

            const koodousScore = ((data.koodous.rating + 100) / 200) * 100;
            score = (score + koodousScore) / 2;
        }

        return Math.max(0, Math.min(100, Math.round(score)));
    }
    private calculatePrivacyScore(data: MultiSourceData): number {
        let score = 100;

        if (data.etip) {
            score -= data.etip.trackers * 2;
            score -= data.etip.dangerousTrackers.length * 6;
        }

        if (data.permissions) {
            score -= data.permissions.dangerous * 3;
        }

        return Math.max(0, Math.min(100, Math.round(score)));
    }

    private calculateReputationScore(data: MultiSourceData): number {
        if (!data.playStore) return 50; // valeur neutre

        let score =
            data.playStore.reputationScore ??
            (data.playStore.rating ? data.playStore.rating * 20 : 50);

        const daysSinceUpdate = this.getDaysSinceUpdate(data.playStore.updated);

        if (daysSinceUpdate > 365) score -= 15;
        else if (daysSinceUpdate > 180) score -= 8;

        // Bonus : app très populaire et bien notée
        if (data.playStore.reviews > 5_000_000 && data.playStore.rating > 4.7) {
            score += 8;
        }

        // Bonus : très bien notée (4.5+) et beaucoup d'installations
        else if (data.playStore.reviews > 1_000_000 && data.playStore.rating > 4.5) {
            score += 5;
        }

        return Math.max(0, Math.min(100, Math.round(score)));
    }

    private calculateConfidence(data: MultiSourceData): number {
        const sources = [
            data.cve,
            data.virusTotal,
            data.koodous,
            data.etip,
            data.playStore,
            data.permissions,
        ].filter(Boolean);

        return Math.min(100, Math.round((sources.length / 6) * 100));
    }

    private generateAlerts(data: MultiSourceData, scores: any): string[] {
        const alerts: string[] = [];

        if (data.cve?.critical ?? 0 > 0) {
            alerts.push(`${data.cve?.critical} critical security vulnerabilities detected`);
        }

        if (data.virusTotal?.verdict === 'malicious') {
            alerts.push(`Flagged as malicious by ${data.virusTotal.malicious} antivirus engines`);
        }

        if (data.koodous?.detected) {
            alerts.push('Detected as malware by Koodous community');
        }

        if (data.etip?.trackers ?? 0 > 10) {
            alerts.push(`Excessive tracking: ${data.etip?.trackers} trackers found`);
        }

        if (data.etip?.dangerousTrackers.length) {
            alerts.push(`Contains dangerous trackers: ${data.etip.dangerousTrackers.join(', ')}`);
        }

        if (data.playStore) {
            if (data.playStore.rating < 3.0 && data.playStore.reviews > 1000) {
                alerts.push('Low user rating with significant reviews');
            }

            const daysSinceUpdate = this.getDaysSinceUpdate(data.playStore.updated);
            if (daysSinceUpdate > 365) {
                alerts.push('App not updated in over a year');
            }

            if (data.playStore.installCount < 1000) {
                alerts.push('Very low installation count - use with caution');
            }

            // Positive insight ✓
            if (data.playStore.rating > 4.7 && data.playStore.reviews > 5_000_000) {
                alerts.push('Highly reputable and widely trusted application');
            }
        }

        if (scores.security < 30) alerts.push('CRITICAL: Severe security risks detected');
        if (scores.privacy < 30) alerts.push('CRITICAL: Severe privacy concerns detected');

        return alerts;
    }


    private getActiveSources(data: MultiSourceData): string[] {
        const sources: string[] = [];

        if (data.cve) sources.push('CVE');
        if (data.virusTotal) sources.push('VirusTotal');
        if (data.koodous) sources.push('Koodous');
        if (data.etip) sources.push('ETIP');
        if (data.playStore) sources.push('Play Store');
        if (data.permissions) sources.push('Permissions');

        return sources;
    }

    private getDaysSinceUpdate(updated: Date | string): number {
        const date = new Date(updated);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        return Math.floor(diffMs / (1000 * 60 * 60 * 24));
    }

    private getRiskLevel(score: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
        if (score >= 70) return 'LOW';
        if (score >= 50) return 'MEDIUM';
        if (score >= 30) return 'HIGH';
        return 'CRITICAL';
    }
}
