
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class ExodusPrivacyService {
  private readonly logger = new Logger(ExodusPrivacyService.name);
  private readonly EXODUS_API = 'https://reports.exodus-privacy.eu.org/api';
  private readonly TIMEOUT = 5000; // 5 secondes
async getTrackers(packageName: string): Promise<string[]> {
    try {
      this.logger.debug(`📤 Fetching trackers for ${packageName}...`);

      const response = await axios.get(
        `${this.EXODUS_API}/search/${packageName}`,
        { timeout: this.TIMEOUT }
      );

      // Exodus retourne: { trackers: [{ id, name }, ...] }
      const trackers = response.data.trackers || [];
      
      const trackerNames = trackers.map((t: any) => t.name);

      if (trackerNames.length > 0) {
        this.logger.log(`✅ Found ${trackerNames.length} trackers for ${packageName}`);
      } else {
        this.logger.debug(`ℹ️ No trackers found for ${packageName} (app may not be in Exodus DB)`);
      }

      return trackerNames;

    } catch (error) {
      if (error.response?.status === 404) {
        this.logger.debug(`ℹ️ ${packageName} not found in Exodus database`);
      } else {
        this.logger.warn(`⚠️ Exodus API failed for ${packageName}: ${error.message}`);
      }
      return []; // Fallback: retourner tableau vide
    }
  }

  /**
   * Récupérer le rapport complet d'une app depuis Exodus
   */
  async getFullReport(packageName: string): Promise<any> {
    try {
      this.logger.debug(`📤 Fetching full report for ${packageName}...`);

      const response = await axios.get(
        `${this.EXODUS_API}/search/${packageName}`,
        { timeout: this.TIMEOUT }
      );

      return response.data;

    } catch (error) {
      this.logger.warn(`⚠️ Failed to get Exodus report for ${packageName}`);
      return null;
    }
  }

  /**
   * Récupérer les infos d'un tracker spécifique
   */
  async getTrackerInfo(trackerId: number): Promise<any> {
    try {
      const response = await axios.get(
        `${this.EXODUS_API}/trackers/${trackerId}`,
        { timeout: this.TIMEOUT }
      );

      return response.data;

    } catch (error) {
      this.logger.warn(`⚠️ Failed to get tracker info for ID ${trackerId}`);
      return null;
    }
  }


  // Rechercher une app
  async searchApp(packageName: string) {
    try {
      const response = await axios.get(`${this.EXODUS_API}/search/${packageName}`);
      return response.data.applications?.[0] || null;
    } catch (error) {
      this.logger.warn(`App not found in Exodus: ${packageName}`);
      return null;
    }
  }

  // Récupérer le rapport complet d'une app
  async getAppReport(reportId: number) {
    try {
      const response = await axios.get(`${this.EXODUS_API}/report/${reportId}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to fetch report ${reportId}`, error);
      return null;
    }
  }

  // Analyser une app (search + report)
  async analyzeApp(packageName: string) {
    const app = await this.searchApp(packageName);
    if (!app) return null;

    const report = await this.getAppReport(app.id);
    
    return {
      packageName: app.handle,
      name: app.name,
      version: app.version,
      trackers: report?.trackers || [],
      permissions: report?.permissions || [],
      exodusScore: this.calculateExodusScore(report),
    };
  }

  private calculateExodusScore(report: any): number {
    if (!report) return 50;

    let score = 100;
    const trackerCount = report.trackers?.length || 0;
    
    // -5 points par tracker
    score -= trackerCount * 5;

    return Math.max(0, Math.min(100, score));
  }
}