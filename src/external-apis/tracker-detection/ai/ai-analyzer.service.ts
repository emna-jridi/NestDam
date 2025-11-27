// src/external-apis/tracker-detection/ai/ai-analyzer.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { OpenRouterAiService } from './openrouter-ai.service'; 
import {
  TrackerDetectionContext,
  DetectedTracker,
  Recommendation,
} from '../interfaces/tracker-detection.interface';

@Injectable()
export class AiAnalyzerService {
  private readonly logger = new Logger(AiAnalyzerService.name);

  constructor(
    private readonly openrouter: OpenRouterAiService, 
  ) {}


  async detectTrackersFromPermissions(
    context: TrackerDetectionContext,
  ): Promise<DetectedTracker[]> {
    this.logger.debug(
      `AI tracker detection for ${context.packageName} (${context.platform})`,
    );

    const systemPrompt = `Tu es un expert en vie privée et sécurité mobile (Android/iOS).
Tu analyses les permissions d'une app pour détecter quels SDKs de tracking sont probablement présents.`;

    const userPrompt = `App: ${context.packageName} (${context.platform})
${context.appName ? `Nom: ${context.appName}` : ''}
${context.category ? `Catégorie: ${context.category}` : ''}

Permissions:
${(context.permissions || []).join('\n')}

Basé sur ces permissions, quels trackers/SDKs sont TRÈS PROBABLEMENT présents ?

Réponds UNIQUEMENT avec un JSON valide (pas de markdown) :
{
  "trackers": [
    {
      "name": "Nom du tracker",
      "confidence": 85,
      "reason": "Raison courte (ex: Permission INTERNET + ACCESS_NETWORK_STATE)"
    }
  ]
}

IMPORTANT: 
- Sois conservateur (ne devine pas)
- Confidence entre 50-95 max
- Maximum 10 trackers
- Pas de markdown, juste le JSON`;

    try {
      const response = await this.openrouter.complete(systemPrompt, userPrompt, 0.5);
      const parsed = this.openrouter.parseJsonResponse<{ trackers: DetectedTracker[] }>(
        response,
      );

      this.logger.log(
        `AI detected ${parsed.trackers.length} trackers for ${context.packageName}`,
      );

      return parsed.trackers || [];
    } catch (error) {
      this.logger.error(
        `AI tracker detection failed: ${error.message}`,
      );
      return [];
    }
  }


  async analyzeRisk(
    context: TrackerDetectionContext,
    trackers: DetectedTracker[],
  ): Promise<{
    riskScore: number;
    riskLevel: string;
    concerns: string[];
    positivePoints: string[];
  }> {
    this.logger.debug(`AI risk analysis for ${context.packageName}`);

    const dangerousPermissions = this.getDangerousPermissions(
      context.permissions || [],
    );

    const systemPrompt = `Tu es un analyste en cybersécurité mobile.
Tu évalues le risque d'une app de manière objective et équilibrée.`;

    const userPrompt = `App: ${context.packageName} (${context.platform})
${context.appName ? `Nom: ${context.appName}` : ''}
${context.installs ? `Popularité: ${context.installs} installations` : ''}

Trackers détectés: ${trackers.map((t) => t.name).join(', ')}
Permissions dangereuses: ${dangerousPermissions.join(', ')}

Analyse le risque en JSON (pas de markdown) :
{
  "riskScore": 65,
  "riskLevel": "MEDIUM",
  "concerns": [
    "Préoccupation 1 (spécifique et factuelle)",
    "Préoccupation 2",
    "Préoccupation 3"
  ],
  "positivePoints": [
    "Point positif 1 (si applicable)",
    "Point positif 2"
  ]
}

IMPORTANT:
- riskScore: 0-100 (0=sûr, 100=très dangereux)
- riskLevel: LOW, MEDIUM, HIGH, ou CRITICAL
- Sois équilibré (mentionne le positif si applicable)
- Maximum 5 concerns et 3 positivePoints
- Pas de markdown, juste le JSON`;

    try {
      const response = await this.openrouter.complete(systemPrompt, userPrompt, 0.6);
      const parsed = this.openrouter.parseJsonResponse<any>(response);

      this.logger.log(
        `AI risk analysis: ${parsed.riskScore}/100 (${parsed.riskLevel})`,
      );

      return parsed;
    } catch (error) {
      this.logger.error(`AI risk analysis failed: ${error.message}`);
      return {
        riskScore: 50,
        riskLevel: 'MEDIUM',
        concerns: ['Unable to analyze risk'],
        positivePoints: [],
      };
    }
  }

  /**
   * ✅ ANALYSE 3 : Générer recommandations
   */
  async generateRecommendations(
    context: TrackerDetectionContext,
    riskLevel: string,
    concerns: string[],
  ): Promise<{
    recommendations: Recommendation[];
    shouldUninstall: boolean;
    alternatives: string[];
  }> {
    this.logger.debug(`AI recommendations for ${context.packageName}`);

    const systemPrompt = `Tu es un conseiller en sécurité mobile pour utilisateurs non-techniques.
Tu donnes des conseils concrets et actionnables pour protéger sa vie privée.`;

    const userPrompt = `App: ${context.appName || context.packageName} (${context.platform})
Niveau de risque: ${riskLevel}
Préoccupations: ${concerns.join(', ')}

Donne des recommandations concrètes en JSON (pas de markdown) :
{
  "recommendations": [
    {
      "action": "Action concrète (ex: Désactiver la localisation)",
      "impact": "Impact sur la vie privée",
      "howTo": "Instructions précises (Paramètres → ...)",
      "platform": "android" ou "ios" ou "both"
    }
  ],
  "shouldUninstall": false,
  "alternatives": ["App alternative 1", "App alternative 2"]
}

IMPORTANT:
- Maximum 3 recommendations actionnables
- Instructions PRÉCISES (avec navigation dans les menus)
- Alternatives réelles si shouldUninstall=true
- Pas de markdown, juste le JSON`;

    try {
      const response = await this.openrouter.complete(systemPrompt, userPrompt, 0.7);
      const parsed = this.openrouter.parseJsonResponse<any>(response);

      this.logger.log(
        `AI generated ${parsed.recommendations?.length || 0} recommendations`,
      );

      return parsed;
    } catch (error) {
      this.logger.error(
        `AI recommendations failed: ${error.message}`,
      );
      return {
        recommendations: [],
        shouldUninstall: false,
        alternatives: [],
      };
    }
  }

  /**
   * Helper : Permissions dangereuses
   */
  private getDangerousPermissions(permissions: string[]): string[] {
    const dangerous = [
      'CAMERA',
      'RECORD_AUDIO',
      'ACCESS_FINE_LOCATION',
      'ACCESS_COARSE_LOCATION',
      'READ_CONTACTS',
      'WRITE_CONTACTS',
      'READ_SMS',
      'SEND_SMS',
      'READ_CALL_LOG',
      'WRITE_CALL_LOG',
      'READ_PHONE_STATE',
      'CALL_PHONE',
      'READ_EXTERNAL_STORAGE',
      'WRITE_EXTERNAL_STORAGE',
    ];

    return permissions.filter((p) =>
      dangerous.some((d) => p.includes(d)),
    );
  }
}