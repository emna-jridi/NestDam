import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Tracker } from '../app-registry/schemas/tracker.schema';

export interface TrackerAnalysis {
  name: string;
  company: string;
  category: string;
  privacyImpact: number;
  description: string;
  isKnown: boolean;
}

export interface TrackerDetectionResult {
  totalTrackers: number;
  knownTrackers: TrackerAnalysis[];
  unknownTrackers: string[];
  categories: { [key: string]: number };
  totalPrivacyImpact: number;
  riskScore: number;
}

@Injectable()
export class TrackerDetectorService {
  private readonly logger = new Logger(TrackerDetectorService.name);

  constructor(
    @InjectModel(Tracker.name) private trackerModel: Model<Tracker>,
  ) {}

  /**
   * 🔧 DEBUG: Vérifier l'état de la base de données
   */
  async debugDatabase(): Promise<any> {
    const totalTrackers = await this.trackerModel.countDocuments();
    const sampleTrackers = await this.trackerModel.find().limit(10).exec();
    
    this.logger.log(`📊 Total trackers in DB: ${totalTrackers}`);
    this.logger.log(`📋 Sample tracker IDs:`, sampleTrackers.map(t => ({
      exodusId: t.exodusId,
      name: t.name
    })));
    
    return {
      totalInDatabase: totalTrackers,
      sampleIds: sampleTrackers.map(t => t.exodusId),
      samples: sampleTrackers.map(t => ({
        exodusId: t.exodusId,
        name: t.name,
        category: t.category
      }))
    };
  }

  /**
   * Analyser une liste de trackers avec DEBUG amélioré
   */
  async analyzeTrackers(trackerIds: number[]): Promise<TrackerDetectionResult> {
    const knownTrackers: TrackerAnalysis[] = [];
    const unknownTrackers: string[] = [];
    const categories: { [key: string]: number } = {};
    let totalPrivacyImpact = 0;

    for (const trackerId of trackerIds) {
      const trackerIdAsNumber = Number(trackerId);

      // ✅ Type explicite ajouté
      const tracker: Tracker | null = await this.trackerModel
        .findOne({ exodusId: trackerIdAsNumber })
        .exec();

      if (tracker) {
        const analysis: TrackerAnalysis = {
          name: tracker.name,
          company: tracker.company || 'Unknown',
          category: tracker.category || 'Other',
          privacyImpact: tracker.privacyImpact || 5,
          description: tracker.description || '',
          isKnown: true,
        };

        knownTrackers.push(analysis);
        totalPrivacyImpact += tracker.privacyImpact || 5;

        // Compter par catégorie
        const cat = tracker.category || 'Other';
        categories[cat] = (categories[cat] || 0) + 1;
      } else {
        unknownTrackers.push(`tracker_${trackerId}`);
        totalPrivacyImpact += 5;
      }
    }

    const riskScore = this.calculateTrackerRiskScore(
      knownTrackers.length,
      unknownTrackers.length,
      totalPrivacyImpact,
    );

    return {
      totalTrackers: trackerIds.length,
      knownTrackers,
      unknownTrackers,
      categories,
      totalPrivacyImpact,
      riskScore,
    };
  }


  /**
   * Détecter les trackers par noms (depuis analyse statique)
   */
  async detectTrackersByNames(trackerNames: string[]): Promise<TrackerDetectionResult> {
    this.logger.log(`🔍 Detecting trackers by names: ${trackerNames.join(', ')}`);

    const knownTrackers: TrackerAnalysis[] = [];
    const unknownTrackers: string[] = [];
    const categories: { [key: string]: number } = {};
    let totalPrivacyImpact = 0;

    for (const name of trackerNames) {
      this.logger.log(`🔎 Searching for tracker name: "${name}"`);
      
      // Recherche insensible à la casse
      const tracker = await this.trackerModel.findOne({ 
        name: { $regex: new RegExp(name, 'i') } 
      });

      if (tracker) {
        this.logger.log(`✅ Found tracker by name: ${tracker.name}`);
        
        const analysis: TrackerAnalysis = {
          name: tracker.name,
          company: tracker.company,
          category: tracker.category,
          privacyImpact: tracker.privacyImpact,
          description: tracker.description,
          isKnown: true,
        };

        knownTrackers.push(analysis);
        totalPrivacyImpact += tracker.privacyImpact;
        categories[tracker.category] = (categories[tracker.category] || 0) + 1;
      } else {
        this.logger.warn(`❌ Tracker name not found: "${name}"`);
        unknownTrackers.push(name);
        totalPrivacyImpact += 7; // Impact plus élevé pour trackers inconnus
      }
    }

    const riskScore = this.calculateTrackerRiskScore(
      knownTrackers.length,
      unknownTrackers.length,
      totalPrivacyImpact,
    );

    return {
      totalTrackers: trackerNames.length,
      knownTrackers,
      unknownTrackers,
      categories,
      totalPrivacyImpact,
      riskScore,
    };
  }

  /**
   * 🆕 Méthode hybride : chercher par ID OU par nom
   */
  async analyzeTrackersFlexible(
    trackerIdentifiers: Array<number | string>
  ): Promise<TrackerDetectionResult> {
    this.logger.log(`🔍 Flexible analysis of ${trackerIdentifiers.length} identifiers`);

    const knownTrackers: TrackerAnalysis[] = [];
    const unknownTrackers: string[] = [];
    const categories: { [key: string]: number } = {};
    let totalPrivacyImpact = 0;

    for (const identifier of trackerIdentifiers) {
      let tracker: Tracker | null = null;

      // Essayer de trouver par exodusId si c'est un nombre
      if (typeof identifier === 'number' || !isNaN(Number(identifier))) {
        const numId = Number(identifier);
        tracker = await this.trackerModel.findOne({ exodusId: numId }).exec();
        
        if (tracker) {
          this.logger.log(`✅ Found by exodusId: ${tracker.name} (${numId})`);
        }
      }

      // Si pas trouvé, essayer par nom
      if (!tracker && typeof identifier === 'string') {
        tracker = await this.trackerModel.findOne({ 
          name: { $regex: new RegExp(identifier, 'i') } 
        }).exec();
        
        if (tracker) {
          this.logger.log(`✅ Found by name: ${tracker.name}`);
        }
      }

      if (tracker) {
        const analysis: TrackerAnalysis = {
          name: tracker.name,
          company: tracker.company || 'Unknown',
          category: tracker.category || 'Other',
          privacyImpact: tracker.privacyImpact || 5,
          description: tracker.description || '',
          isKnown: true,
        };

        knownTrackers.push(analysis);
        totalPrivacyImpact += tracker.privacyImpact || 5;
        categories[tracker.category || 'Other'] = (categories[tracker.category || 'Other'] || 0) + 1;
      } else {
        this.logger.warn(`❌ Not found: ${identifier}`);
        unknownTrackers.push(String(identifier));
        totalPrivacyImpact += 6;
      }
    }

    const riskScore = this.calculateTrackerRiskScore(
      knownTrackers.length,
      unknownTrackers.length,
      totalPrivacyImpact,
    );

    return {
      totalTrackers: trackerIdentifiers.length,
      knownTrackers,
      unknownTrackers,
      categories,
      totalPrivacyImpact,
      riskScore,
    };
  }

  /**
   * Calculer le score de risque basé sur les trackers
   */
  private calculateTrackerRiskScore(
    knownCount: number,
    unknownCount: number,
    totalImpact: number,
  ): number {
    let score = 100;

    // -3 points par tracker connu
    score -= knownCount * 3;

    // -5 points par tracker inconnu (plus grave)
    score -= unknownCount * 5;

    // -1 point par unité d'impact
    score -= totalImpact;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Obtenir les trackers les plus invasifs
   */
  async getMostInvasiveTrackers(limit: number = 10): Promise<Tracker[]> {
    return this.trackerModel
      .find()
      .sort({ privacyImpact: -1 })
      .limit(limit)
      .exec();
  }

  /**
   * Obtenir les trackers par catégorie
   */
  async getTrackersByCategory(category: string): Promise<Tracker[]> {
    return this.trackerModel.find({ category }).exec();
  }

  /**
   * Rechercher un tracker par nom
   */
  async searchTracker(query: string): Promise<Tracker[]> {
    return this.trackerModel
      .find({
        $or: [
          { name: { $regex: new RegExp(query, 'i') } },
          { company: { $regex: new RegExp(query, 'i') } },
        ],
      })
      .limit(20)
      .exec();
  }

  /**
   * Obtenir des recommandations basées sur les trackers détectés
   */
  getTrackerRecommendations(analysis: TrackerDetectionResult): string[] {
    const recommendations: string[] = [];

    if (analysis.totalTrackers === 0) {
      return ['✅ Aucun tracker détecté'];
    }

    if (analysis.totalTrackers > 10) {
      recommendations.push(
        `🔴 ${analysis.totalTrackers} trackers détectés - Extrêmement invasif`,
      );
      recommendations.push('Considérer une alternative avec moins de tracking');
    } else if (analysis.totalTrackers > 5) {
      recommendations.push(
        `🟡 ${analysis.totalTrackers} trackers détectés - Niveau modéré de tracking`,
      );
    }

    if (analysis.unknownTrackers.length > 0) {
      recommendations.push(
        `⚠️ ${analysis.unknownTrackers.length} tracker(s) inconnu(s) - Risque potentiel`,
      );
    }

    // Recommandations par catégorie
    if (analysis.categories['Advertisement']) {
      const count = analysis.categories['Advertisement'];
      recommendations.push(
        `📢 ${count} tracker(s) publicitaire(s) - Profilage marketing actif`,
      );
    }

    if (analysis.categories['Analytics']) {
      const count = analysis.categories['Analytics'];
      recommendations.push(
        `📊 ${count} tracker(s) d'analyse - Collecte de données comportementales`,
      );
    }

    if (analysis.categories['Location']) {
      recommendations.push(
        '📍 Tracking de localisation détecté - Surveillance de vos déplacements',
      );
    }

    if (analysis.totalPrivacyImpact > 50) {
      recommendations.push(
        '🔴 Impact vie privée très élevé - Collecte massive de données',
      );
    }

    return recommendations;
  }

  /**
   * Comparer les trackers de deux apps
   */
  compareAppTrackers(
    app1Trackers: TrackerAnalysis[],
    app2Trackers: TrackerAnalysis[],
  ): {
    app1Only: TrackerAnalysis[];
    app2Only: TrackerAnalysis[];
    common: TrackerAnalysis[];
    recommendation: string;
  } {
    const app1Names = new Set(app1Trackers.map(t => t.name));
    const app2Names = new Set(app2Trackers.map(t => t.name));

    const app1Only = app1Trackers.filter(t => !app2Names.has(t.name));
    const app2Only = app2Trackers.filter(t => !app1Names.has(t.name));
    const common = app1Trackers.filter(t => app2Names.has(t.name));

    let recommendation = '';
    if (app1Only.length < app2Only.length) {
      recommendation = 'App 1 a moins de trackers uniques - Meilleur choix pour la vie privée';
    } else if (app1Only.length > app2Only.length) {
      recommendation = 'App 2 a moins de trackers uniques - Meilleur choix pour la vie privée';
    } else {
      recommendation = 'Niveau de tracking similaire - Vérifier d\'autres critères';
    }

    return { app1Only, app2Only, common, recommendation };
  }

  /**
   * Générer un rapport détaillé sur les trackers
   */
  generateTrackerReport(analysis: TrackerDetectionResult): {
    summary: string;
    details: any;
    recommendations: string[];
  } {
    const summary = `${analysis.totalTrackers} tracker(s) détecté(s) - Score de risque: ${analysis.riskScore}/100`;

    const details = {
      breakdown: {
        known: analysis.knownTrackers.length,
        unknown: analysis.unknownTrackers.length,
      },
      byCategory: analysis.categories,
      topTrackers: analysis.knownTrackers
        .sort((a, b) => b.privacyImpact - a.privacyImpact)
        .slice(0, 5),
      totalPrivacyImpact: analysis.totalPrivacyImpact,
    };

    const recommendations = this.getTrackerRecommendations(analysis);

    return { summary, details, recommendations };
  }
}