import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import axios, { AxiosResponse } from 'axios';
import { ConfigService } from '@nestjs/config';
import { LeakcheckResponseDto } from './dto/leakcheck-response.dto';
import { LeakcheckItemDto } from './dto/leakcheck-item.dto';
import { LeakcheckSummaryDto } from './dto/leakcheck-summary.dto';

interface LeakcheckApiSource {
  name?: string;
  breach_date?: string;
  [key: string]: any;
}

interface LeakcheckApiResultItem {
  email: string;
  source?: LeakcheckApiSource | null;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  fields?: string[];
}

interface LeakcheckApiResponse {
  success: boolean;
  found: number;
  quota: number;
  result: LeakcheckApiResultItem[];
}

@Injectable()
export class LeakcheckService {
  private readonly apiKey: string | undefined;

  constructor(private configService: ConfigService) {
    this.apiKey =
      this.configService.get<string>('LEAKCHECK_API_KEY') ||
      process.env.LEAKCHECK_API_KEY;
  }

  async checkEmail(email: string): Promise<LeakcheckResponseDto> {
    if (!this.apiKey) {
      throw new HttpException(
        'Leakcheck API key not configured',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const url = `https://leakcheck.io/api/v2/query/${encodeURIComponent(email)}`;

    try {
      const resp: AxiosResponse<LeakcheckApiResponse> = await axios.get(url, {
        headers: {
          Accept: 'application/json',
          'X-API-Key': this.apiKey,
        },
        timeout: 10000,
      });
      const data = resp.data;

      const items: LeakcheckItemDto[] = (
        Array.isArray(data.result) ? data.result : []
      ).map((r: LeakcheckApiResultItem) => {
        const item: LeakcheckItemDto = {
          email: r.email,
          source: r.source ?? null,
          firstName: r.first_name ?? null,
          lastName: r.last_name ?? null,
          username: r.username ?? null,
          fields: r.fields ?? [],
          lastSeen: r.source?.breach_date ?? null,
        };
        return item;
      });

      const normalized: LeakcheckResponseDto = {
        success: Boolean(data.success),
        found: Number(data.found ?? 0),
        quota: Number(data.quota ?? 0),
        results: items,
      };

      return normalized;
    } catch (err: any) {
      if (axios.isAxiosError(err) && err.response) {
        const status = err.response.status || 500;
        const message =
          (err.response.data as any)?.message ||
          err.response.data ||
          err.message;
        throw new HttpException(`Leakcheck API error: ${message}`, status);
      }
      throw new HttpException(
        `Leakcheck request failed: ${err?.message ?? String(err)}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  async checkEmailSummary(email: string): Promise<LeakcheckSummaryDto> {
    const full = await this.checkEmail(email);
    const breachesCount = full.found ?? full.results.length ?? 0;
    let lastSeen: string | null = null;

    for (const r of full.results) {
      if (r.lastSeen) {
        // lastSeen format is expected YYYY-MM or similar; pick the latest string
        if (!lastSeen || String(r.lastSeen) > String(lastSeen)) {
          lastSeen = r.lastSeen ?? null;
        }
      }
    }

    const summary: LeakcheckSummaryDto = {
      compromised: breachesCount > 0,
      breachesCount,
      lastSeen,
    };

    return summary;
  }
}
