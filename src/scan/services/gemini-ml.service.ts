/**
 * Gemini ML Analysis Service
 * ==========================
 * Uses Google Gemini API for intelligent app security analysis.
 * Provides explanations, recommendations, and risk assessment.
 */

import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

export interface GeminiAnalysisResult {
  malwareProbability: number;
  riskLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  verdict: 'malicious' | 'suspicious' | 'benign';
  confidence: number;
  explanation: string;
  recommendations: string[];
  riskFactors: string[];
  safetyTips: string[];
  analysisDetails: {
    permissionsAnalysis: string;
    trackersAnalysis: string;
    behaviorAnalysis: string;
  };
}

export interface AppAnalysisInput {
  packageName: string;
  appName?: string;
  permissions: string[];
  trackers: { name: string; category: string }[];
  isSystemApp: boolean;
  signatureValid: boolean;
  minSdkVersion?: number;
  targetSdkVersion?: number;
}

/** Scan facts handed to Gemini: the verdict is LightGBM's and is never changed here */
export interface ScanExplanationInput {
  packageName: string;
  appName?: string;
  verdict: 'malicious' | 'benign';
  malwareProbability: number;
  riskLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  topFeatures: { name: string; impact: number }[];
  permissions: string[];
  trackers: { name: string; category: string }[];
  signatureValid: boolean;
}

export type ScanExplanation = Pick<
  GeminiAnalysisResult,
  'explanation' | 'recommendations' | 'riskFactors' | 'safetyTips' | 'analysisDetails'
> & { analysisSource: 'lightgbm+gemini' | 'lightgbm' };

@Injectable()
export class GeminiMLService {
  private readonly logger = new Logger(GeminiMLService.name);
  private readonly API_KEY = process.env.GEMINI_API_KEY;
  // An alias by default: pinned versions (e.g. gemini-1.5-flash) get retired and then 404
  private readonly MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
  private readonly API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${this.MODEL}:generateContent`;
  private readonly TIMEOUT = 30000; // 30 seconds

  /**
   * Analyze app using Gemini AI
   */
  async analyzeApp(input: AppAnalysisInput): Promise<GeminiAnalysisResult> {
    if (!this.API_KEY) {
      this.logger.warn('Gemini API key not configured, using fallback analysis');
      return this.getFallbackAnalysis(input);
    }

    try {
      const prompt = this.buildAnalysisPrompt(input);
      const response = await this.callGeminiAPI(prompt);
      return this.parseGeminiResponse(response, input);
    } catch (error) {
      this.logger.error(`Gemini analysis failed: ${error.message}`);
      return this.getFallbackAnalysis(input);
    }
  }

  /**
   * Explain a LightGBM verdict in plain French (Gemini writes text only, never the verdict)
   */
  async explainScan(input: ScanExplanationInput): Promise<ScanExplanation> {
    if (this.API_KEY) {
      try {
        const response = await this.callGeminiAPI(this.buildExplanationPrompt(input));
        const parsed = JSON.parse(this.stripCodeFence(response));
        return {
          explanation: parsed.explanation || this.fallbackScanExplanation(input),
          recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
          riskFactors: Array.isArray(parsed.riskFactors) ? parsed.riskFactors : [],
          safetyTips: Array.isArray(parsed.safetyTips) ? parsed.safetyTips : [],
          analysisDetails: {
            permissionsAnalysis: parsed.analysisDetails?.permissionsAnalysis || '',
            trackersAnalysis: parsed.analysisDetails?.trackersAnalysis || '',
            behaviorAnalysis: parsed.analysisDetails?.behaviorAnalysis || '',
          },
          analysisSource: 'lightgbm+gemini',
        };
      } catch (error) {
        this.logger.error(`Gemini explanation failed: ${error.message}`);
      }
    }

    // No Gemini: same facts, template text
    const appInput = this.toAppInput(input);
    const dangerousPerms = this.getDangerousPermissions(input.permissions);
    return {
      explanation: this.fallbackScanExplanation(input),
      recommendations: this.generateRecommendations(appInput, input.verdict === 'malicious' ? 1 : 0, dangerousPerms),
      riskFactors: [
        ...input.topFeatures.slice(0, 3).map((f) => `Signal du modèle : ${this.featureLabel(f.name)}`),
        ...this.generateRiskFactors(appInput, dangerousPerms, input.trackers.length).filter((f) => !f.startsWith('Aucun')),
      ],
      safetyTips: this.generateSafetyTips(input.riskLevel),
      analysisDetails: {
        permissionsAnalysis: `${dangerousPerms.length} permissions dangereuses détectées sur ${input.permissions.length} au total.`,
        trackersAnalysis: `${input.trackers.length} trackers détectés.`,
        behaviorAnalysis: `Score du modèle : ${Math.round(input.malwareProbability * 100)} %.`,
      },
      analysisSource: 'lightgbm',
    };
  }

  private buildExplanationPrompt(input: ScanExplanationInput): string {
    const signals = input.topFeatures.map((f) => `- ${this.featureLabel(f.name)}`).join('\n') || '- Aucun signal marquant';
    const trackerList = input.trackers.map((t) => `${t.name} (${t.category})`).join(', ') || 'Aucun détecté';

    return `Tu es un expert en cybersécurité mobile Android. Un modèle de détection de malware (LightGBM, entraîné sur des milliers d'APK) a déjà analysé cette application. Ton rôle est d'EXPLIQUER son résultat à un utilisateur non technique, en français.

## Résultat du modèle (ne le remets pas en cause, ne le modifie pas):
- **Verdict**: ${input.verdict === 'malicious' ? 'malveillante' : 'saine'}
- **Score**: ${Math.round(input.malwareProbability * 100)} %
- **Niveau de risque**: ${input.riskLevel}

## Signaux qui ont le plus poussé le modèle vers "malware":
${signals}

## Application:
- **Package**: ${input.packageName}
- **Nom**: ${input.appName || 'Inconnu'}
- **Signature valide**: ${input.signatureValid ? 'Oui' : 'Non'}
- **Permissions (${input.permissions.length})**: ${input.permissions.join(', ') || 'Aucune'}
- **Trackers (${input.trackers.length})**: ${trackerList}

## Instructions:
Réponds UNIQUEMENT avec un JSON valide (sans markdown, sans backticks) suivant ce format exact:

{
  "explanation": "2-3 phrases claires qui expliquent le verdict du modèle",
  "recommendations": ["Action concrète 1", "Action concrète 2"],
  "riskFactors": ["Facteur de risque 1", "Facteur de risque 2"],
  "safetyTips": ["Conseil 1", "Conseil 2"],
  "analysisDetails": {
    "permissionsAnalysis": "Analyse des permissions",
    "trackersAnalysis": "Analyse des trackers",
    "behaviorAnalysis": "Comportement probable, d'après les signaux du modèle"
  }
}`;
  }

  private fallbackScanExplanation(input: ScanExplanationInput): string {
    const name = input.appName || input.packageName;
    const score = Math.round(input.malwareProbability * 100);
    const signals = input.topFeatures.slice(0, 3).map((f) => this.featureLabel(f.name)).join(', ');
    if (input.verdict === 'malicious') {
      return `Le modèle classe ${name} comme probablement malveillante (score ${score} %). Signaux principaux : ${signals}.`;
    }
    return `Le modèle ne détecte pas de comportement malveillant dans ${name} (score ${score} %).`;
  }

  /** perm::android.permission.READ_SMS -> permission READ_SMS, sapi::Lx/SmsManager;->send -> SmsManager.send */
  private featureLabel(name: string): string {
    const [family, value = ''] = name.includes('::') ? name.split('::') : ['', name];
    const shortClass = (cls: string) => cls.replace(/;$/, '').split('/').pop();
    switch (family) {
      case 'perm': return `permission ${value.split('.').pop()}`;
      case 'sapi': {
        const [cls, method] = value.split(';->');
        return `appel ${shortClass(cls)}.${method}`;
      }
      case 'api': return `utilise ${shortClass(value)}`;
      case 'intent': return `écoute ${value.split('.').pop()}`;
      case 'feat': return `matériel ${value.split('.').pop()}`;
      case 'meta': return value === 'zip_fake_encryption' ? 'faux chiffrement du zip (anti-analyse)' : 'manifeste corrompu (anti-analyse)';
      default: return value;
    }
  }

  private toAppInput(input: ScanExplanationInput): AppAnalysisInput {
    return {
      packageName: input.packageName,
      appName: input.appName,
      permissions: input.permissions,
      trackers: input.trackers,
      isSystemApp: false,
      signatureValid: input.signatureValid,
    };
  }

  /**
   * Build comprehensive analysis prompt
   */
  private buildAnalysisPrompt(input: AppAnalysisInput): string {
    const dangerousPerms = this.getDangerousPermissions(input.permissions);
    const trackerList = input.trackers.map(t => `${t.name} (${t.category})`).join(', ') || 'Aucun détecté';

    return `Tu es un expert en cybersécurité mobile Android. Analyse cette application et fournis une évaluation de sécurité détaillée en JSON.

## Application à analyser:
- **Package**: ${input.packageName}
- **Nom**: ${input.appName || 'Inconnu'}
- **Application système**: ${input.isSystemApp ? 'Oui' : 'Non'}
- **Signature valide**: ${input.signatureValid ? 'Oui' : 'Non'}
- **SDK Min**: ${input.minSdkVersion || 'Non spécifié'}
- **SDK Target**: ${input.targetSdkVersion || 'Non spécifié'}

## Permissions (${input.permissions.length} total):
${input.permissions.join(', ') || 'Aucune'}

## Permissions dangereuses détectées (${dangerousPerms.length}):
${dangerousPerms.join(', ') || 'Aucune'}

## Trackers détectés (${input.trackers.length}):
${trackerList}

## Instructions:
Analyse les risques de sécurité et de confidentialité de cette application. Réponds UNIQUEMENT avec un JSON valide (sans markdown, sans backticks) suivant ce format exact:

{
  "malwareProbability": 0.XX,
  "riskLevel": "LOW|MEDIUM|HIGH|CRITICAL",
  "verdict": "benign|suspicious|malicious",
  "confidence": XX,
  "explanation": "Explication claire et concise en français du niveau de risque global de l'application",
  "recommendations": [
    "Recommandation 1 en français",
    "Recommandation 2 en français"
  ],
  "riskFactors": [
    "Facteur de risque 1 identifié",
    "Facteur de risque 2 identifié"
  ],
  "safetyTips": [
    "Conseil de sécurité 1",
    "Conseil de sécurité 2"
  ],
  "analysisDetails": {
    "permissionsAnalysis": "Analyse des permissions en français",
    "trackersAnalysis": "Analyse des trackers en français",
    "behaviorAnalysis": "Analyse du comportement probable en français"
  }
}

Critères d'évaluation:
- CRITICAL: malware confirmé, permissions excessives + trackers invasifs
- HIGH: comportement suspect, combinaison dangereuse de permissions
- MEDIUM: quelques risques modérés, trackers publicitaires
- LOW: application sûre, permissions justifiées`;
  }

  /**
   * Call Gemini API
   */
  private async callGeminiAPI(prompt: string): Promise<string> {
    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: prompt,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.3,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 2048,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ],
    };

    this.logger.debug(`Calling Gemini API for analysis...`);

    const response = await axios.post(this.API_URL, requestBody, {
      timeout: this.TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.API_KEY, // header, not query string: keeps the key out of URLs and error logs
      },
    });

    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('Empty response from Gemini API');
    }

    this.logger.debug(`Gemini response received (${text.length} chars)`);
    return text;
  }

  /**
   * Parse Gemini response to structured result
   */
  private parseGeminiResponse(response: string, input: AppAnalysisInput): GeminiAnalysisResult {
    try {
      const parsed = JSON.parse(this.stripCodeFence(response));

      return {
        malwareProbability: this.clamp(parsed.malwareProbability || 0.1, 0, 1),
        riskLevel: this.validateRiskLevel(parsed.riskLevel),
        verdict: this.validateVerdict(parsed.verdict),
        confidence: this.clamp(parsed.confidence || 70, 0, 100),
        explanation: parsed.explanation || 'Analyse effectuée par intelligence artificielle.',
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
        riskFactors: Array.isArray(parsed.riskFactors) ? parsed.riskFactors : [],
        safetyTips: Array.isArray(parsed.safetyTips) ? parsed.safetyTips : [],
        analysisDetails: {
          permissionsAnalysis: parsed.analysisDetails?.permissionsAnalysis || 'Analyse des permissions effectuée.',
          trackersAnalysis: parsed.analysisDetails?.trackersAnalysis || 'Analyse des trackers effectuée.',
          behaviorAnalysis: parsed.analysisDetails?.behaviorAnalysis || 'Analyse comportementale effectuée.',
        },
      };
    } catch (error) {
      this.logger.warn(`Failed to parse Gemini response: ${error.message}`);
      return this.getFallbackAnalysis(input);
    }
  }

  /**
   * Remove markdown code fences Gemini sometimes adds around JSON
   */
  private stripCodeFence(response: string): string {
    let cleanJson = response.trim();
    if (cleanJson.startsWith('```json')) {
      cleanJson = cleanJson.slice(7);
    }
    if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.slice(3);
    }
    if (cleanJson.endsWith('```')) {
      cleanJson = cleanJson.slice(0, -3);
    }
    return cleanJson.trim();
  }

  /**
   * Get fallback analysis when Gemini is unavailable
   */
  private getFallbackAnalysis(input: AppAnalysisInput): GeminiAnalysisResult {
    const dangerousPerms = this.getDangerousPermissions(input.permissions);
    const trackerCount = input.trackers.length;
    
    // Calculate risk score based on heuristics
    let riskScore = 0.1;
    
    // Permission-based risk
    riskScore += dangerousPerms.length * 0.05;
    if (dangerousPerms.includes('READ_SMS') || dangerousPerms.includes('SEND_SMS')) riskScore += 0.15;
    if (dangerousPerms.includes('READ_CALL_LOG')) riskScore += 0.1;
    if (dangerousPerms.includes('READ_CONTACTS') && dangerousPerms.includes('INTERNET')) riskScore += 0.08;
    
    // Tracker-based risk
    riskScore += Math.min(trackerCount * 0.03, 0.2);
    
    // System app bonus
    if (input.isSystemApp) riskScore -= 0.1;
    
    // Invalid signature penalty
    if (!input.signatureValid) riskScore += 0.2;
    
    riskScore = this.clamp(riskScore, 0, 0.95);
    
    const riskLevel = this.getRiskLevel(riskScore);
    const verdict = riskScore >= 0.5 ? 'suspicious' : riskScore >= 0.7 ? 'malicious' : 'benign';
    
    // Generate contextual explanation
    const explanation = this.generateFallbackExplanation(input, riskScore, dangerousPerms, trackerCount);
    
    return {
      malwareProbability: riskScore,
      riskLevel,
      verdict,
      confidence: 60,
      explanation,
      recommendations: this.generateRecommendations(input, riskScore, dangerousPerms),
      riskFactors: this.generateRiskFactors(input, dangerousPerms, trackerCount),
      safetyTips: this.generateSafetyTips(riskLevel),
      analysisDetails: {
        permissionsAnalysis: `${dangerousPerms.length} permissions dangereuses détectées sur ${input.permissions.length} au total.`,
        trackersAnalysis: `${trackerCount} trackers détectés. ${trackerCount > 3 ? 'Collecte de données importante.' : 'Niveau acceptable.'}`,
        behaviorAnalysis: input.isSystemApp 
          ? 'Application système avec privilèges élevés.'
          : 'Application tierce standard.',
      },
    };
  }

  /**
   * Generate contextual explanation
   */
  private generateFallbackExplanation(
    input: AppAnalysisInput,
    riskScore: number,
    dangerousPerms: string[],
    trackerCount: number,
  ): string {
    if (riskScore < 0.2) {
      return `${input.appName || input.packageName} présente un niveau de risque faible. Les permissions demandées sont justifiées pour son fonctionnement.`;
    }
    if (riskScore < 0.4) {
      return `${input.appName || input.packageName} présente quelques risques modérés. ${dangerousPerms.length} permissions sensibles et ${trackerCount} trackers détectés.`;
    }
    if (riskScore < 0.6) {
      return `Attention: ${input.appName || input.packageName} demande des permissions sensibles (${dangerousPerms.slice(0, 3).join(', ')}). Vérifiez si elles sont nécessaires.`;
    }
    return `Risque élevé détecté pour ${input.appName || input.packageName}. Combinaison suspecte de permissions et trackers. Prudence recommandée.`;
  }

  /**
   * Generate recommendations based on analysis
   */
  private generateRecommendations(
    input: AppAnalysisInput,
    riskScore: number,
    dangerousPerms: string[],
  ): string[] {
    const recommendations: string[] = [];
    
    if (riskScore >= 0.5) {
      recommendations.push('Envisagez de désinstaller cette application si vous ne l\'utilisez pas régulièrement.');
    }
    
    if (dangerousPerms.includes('ACCESS_FINE_LOCATION') || dangerousPerms.includes('ACCESS_COARSE_LOCATION')) {
      recommendations.push('Limitez l\'accès à la localisation à "Uniquement pendant l\'utilisation".');
    }
    
    if (dangerousPerms.includes('CAMERA') || dangerousPerms.includes('RECORD_AUDIO')) {
      recommendations.push('Vérifiez régulièrement les indicateurs de caméra/micro dans la barre d\'état.');
    }
    
    if (dangerousPerms.includes('READ_CONTACTS')) {
      recommendations.push('Refusez l\'accès aux contacts si non essentiel au fonctionnement.');
    }
    
    if (input.trackers.length > 3) {
      recommendations.push('Utilisez un bloqueur de trackers pour limiter la collecte de données.');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('Maintenez l\'application à jour pour bénéficier des correctifs de sécurité.');
      recommendations.push('Vérifiez périodiquement les permissions accordées.');
    }
    
    return recommendations.slice(0, 4);
  }

  /**
   * Generate risk factors
   */
  private generateRiskFactors(
    input: AppAnalysisInput,
    dangerousPerms: string[],
    trackerCount: number,
  ): string[] {
    const factors: string[] = [];
    
    if (dangerousPerms.length > 5) {
      factors.push(`Nombre élevé de permissions sensibles (${dangerousPerms.length})`);
    }
    
    if (trackerCount > 3) {
      factors.push(`Présence de ${trackerCount} trackers publicitaires/analytiques`);
    }
    
    if (!input.signatureValid) {
      factors.push('Signature de l\'application non vérifiée');
    }
    
    if (dangerousPerms.includes('READ_SMS') || dangerousPerms.includes('SEND_SMS')) {
      factors.push('Accès aux SMS (risque d\'interception)');
    }
    
    if (dangerousPerms.includes('READ_CALL_LOG')) {
      factors.push('Accès à l\'historique des appels');
    }
    
    if (factors.length === 0) {
      factors.push('Aucun facteur de risque majeur identifié');
    }
    
    return factors;
  }

  /**
   * Generate safety tips
   */
  private generateSafetyTips(riskLevel: string): string[] {
    const tips: string[] = [
      'Téléchargez uniquement depuis le Google Play Store officiel.',
      'Lisez les avis et vérifiez la réputation du développeur.',
    ];
    
    if (riskLevel === 'HIGH' || riskLevel === 'CRITICAL') {
      tips.push('Activez Google Play Protect pour une protection en temps réel.');
      tips.push('Effectuez des sauvegardes régulières de vos données.');
    }
    
    tips.push('Gardez votre système Android à jour.');
    
    return tips.slice(0, 3);
  }

  /**
   * Get dangerous permissions from list
   */
  private getDangerousPermissions(permissions: string[]): string[] {
    const dangerous = [
      'READ_SMS', 'SEND_SMS', 'RECEIVE_SMS',
      'READ_CALL_LOG', 'WRITE_CALL_LOG',
      'READ_CONTACTS', 'WRITE_CONTACTS',
      'ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'ACCESS_BACKGROUND_LOCATION',
      'CAMERA', 'RECORD_AUDIO',
      'READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE',
      'READ_PHONE_STATE', 'CALL_PHONE',
      'PROCESS_OUTGOING_CALLS',
      'BODY_SENSORS',
      'READ_CALENDAR', 'WRITE_CALENDAR',
    ];
    
    return permissions.filter(p => {
      const permName = p.replace('android.permission.', '');
      return dangerous.includes(permName);
    }).map(p => p.replace('android.permission.', ''));
  }

  /**
   * Get risk level from score
   */
  private getRiskLevel(score: number): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' {
    if (score >= 0.7) return 'CRITICAL';
    if (score >= 0.5) return 'HIGH';
    if (score >= 0.3) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Validate risk level
   */
  private validateRiskLevel(level: string): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' {
    const valid = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
    return valid.includes(level?.toUpperCase()) 
      ? (level.toUpperCase() as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW')
      : 'MEDIUM';
  }

  /**
   * Validate verdict
   */
  private validateVerdict(verdict: string): 'malicious' | 'suspicious' | 'benign' {
    const valid = ['malicious', 'suspicious', 'benign'];
    return valid.includes(verdict?.toLowerCase())
      ? (verdict.toLowerCase() as 'malicious' | 'suspicious' | 'benign')
      : 'benign';
  }

  /**
   * Clamp value between min and max
   */
  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * Check if service is available
   */
  isAvailable(): boolean {
    return !!this.API_KEY;
  }
}
