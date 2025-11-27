import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

export interface KoodousResult {
  rating: number; // -100 (malware) à +100 (safe)
  analyzed: boolean;
  detected: boolean;
  trusted: boolean;
}

@Injectable()
export class KoodousService {
  private readonly logger = new Logger(KoodousService.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.koodous.com/apks';

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    this.apiKey = this.config.get<string>('KOODOUS_API_KEY') || '';
  }

  async checkApk(sha256: string): Promise<KoodousResult> {
    if (!this.apiKey) {
      this.logger.warn('Koodous API key not configured');
      return this.getDefaultResult();
    }

    try {
      const url = `${this.baseUrl}/${sha256}`;

      this.logger.debug(`Checking ${sha256} on Koodous`);

      const response = await firstValueFrom(
        this.http.get(url, {
          headers: { Authorization: `Token ${this.apiKey}` },
          timeout: 10000,
        }),
      );

      const data = response.data;

      return {
        rating: data.rating || 0,
        analyzed: data.analyzed || false,
        detected: data.detected || false,
        trusted: data.trusted || false,
      };
    } catch (error) {
      if (error.response?.status === 404) {
        this.logger.debug('APK not found on Koodous');
      } else {
        this.logger.warn(`Koodous check failed: ${error.message}`);
      }
      return this.getDefaultResult();
    }
  }

  private getDefaultResult(): KoodousResult {
    return { rating: 0, analyzed: false, detected: false, trusted: false };
  }
}