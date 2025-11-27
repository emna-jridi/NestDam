import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

export interface VirusTotalResult {
  malicious: number;
  suspicious: number;
  harmless: number;
  undetected: number;
  reputation: number;
  verdict: 'clean' | 'suspicious' | 'malicious';
}

@Injectable()
export class VirusTotalService {
  private readonly logger = new Logger(VirusTotalService.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://www.virustotal.com/api/v3';

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    this.apiKey = this.config.get<string>('VIRUSTOTAL_API_KEY') || '';
  }


  async scanFileHash(sha256: string): Promise<VirusTotalResult> {
    if (!this.apiKey) {
      this.logger.warn('VirusTotal API key not configured');
      return this.getDefaultResult();
    }

    try {
      const url = `${this.baseUrl}/files/${sha256}`;

      this.logger.debug(`Scanning ${sha256} on VirusTotal`);

      const response = await firstValueFrom(
        this.http.get(url, {
          headers: { 'x-apikey': this.apiKey },
          timeout: 10000,
        }),
      );

      const stats = response.data.data.attributes.last_analysis_stats;

      const malicious = stats.malicious || 0;
      const suspicious = stats.suspicious || 0;

      let verdict: 'clean' | 'suspicious' | 'malicious' = 'clean';
      if (malicious > 5) verdict = 'malicious';
      else if (malicious > 0 || suspicious > 3) verdict = 'suspicious';

      const reputation = Math.max(0, 100 - malicious * 10 - suspicious * 5);

      return {
        malicious,
        suspicious,
        harmless: stats.harmless || 0,
        undetected: stats.undetected || 0,
        reputation,
        verdict,
      };
    } catch (error) {
      if (error.response?.status === 404) {
        this.logger.debug('File not found on VirusTotal');
      } else {
        this.logger.warn(`VirusTotal scan failed: ${error.message}`);
      }
      return this.getDefaultResult();
    }
  }

  private getDefaultResult(): VirusTotalResult {
    return {
      malicious: 0,
      suspicious: 0,
      harmless: 0,
      undetected: 0,
      reputation: 50,
      verdict: 'clean',
    };
  }
}