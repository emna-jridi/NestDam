
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class ExodusPrivacyService {
  private readonly logger = new Logger(ExodusPrivacyService.name);
  private readonly baseUrl = 'https://reports.exodus-privacy.eu.org/api';

  // Récupérer tous les trackers
  async getAllTrackers() {
    try {
      const response = await axios.get(`${this.baseUrl}/trackers`);
      return response.data.trackers;
    } catch (error) {
      this.logger.error('Failed to fetch trackers from Exodus', error);
      return {};
    }
  }

  // Rechercher une app
  async searchApp(packageName: string) {
    try {
      const response = await axios.get(`${this.baseUrl}/search/${packageName}`);
      return response.data.applications?.[0] || null;
    } catch (error) {
      this.logger.warn(`App not found in Exodus: ${packageName}`);
      return null;
    }
  }

  // Récupérer le rapport complet d'une app
  async getAppReport(reportId: number) {
    try {
      const response = await axios.get(`${this.baseUrl}/report/${reportId}`);
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