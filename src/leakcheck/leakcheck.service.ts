import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import axios, { AxiosResponse } from 'axios';
import { LeakcheckResponseDto } from './dto/leakcheck-response.dto';
import { LeakcheckItemDto } from './dto/leakcheck-item.dto';
import { LeakcheckSummaryDto } from './dto/leakcheck-summary.dto';

// Public API response format
interface LeakcheckPublicApiSource {
  name: string;
  date: string; // Format: "YYYY-MM"
}

interface LeakcheckPublicApiResponse {
  success: boolean;
  found: number;
  fields: string[];
  sources: LeakcheckPublicApiSource[];
}

@Injectable()
export class LeakcheckService {
  private readonly logger = new Logger(LeakcheckService.name);
  private readonly publicApiUrl = 'https://leakcheck.io/api/public';

  constructor() {
    this.logger.log(
      'Using Leakcheck public API (free tier). Note: Limited to breach names and dates only.',
    );
  }

  private extractErrorMessage(errorData: unknown): string {
    if (!errorData) {
      return 'Unknown error';
    }

    if (typeof errorData === 'string') {
      return errorData;
    }

    if (typeof errorData === 'object' && errorData !== null) {
      const errorObj = errorData as Record<string, unknown>;

      if (errorObj.message && typeof errorObj.message === 'string') {
        return errorObj.message;
      }
      if (errorObj.error && typeof errorObj.error === 'string') {
        return errorObj.error;
      }
      if (errorObj.detail && typeof errorObj.detail === 'string') {
        return errorObj.detail;
      }
      if (errorObj.msg && typeof errorObj.msg === 'string') {
        return errorObj.msg;
      }

      if (Array.isArray(errorData)) {
        return errorData
          .map((item) => this.extractErrorMessage(item))
          .join(', ');
      }

      try {
        const stringified = JSON.stringify(errorData);
        return stringified.length > 500
          ? stringified.substring(0, 500) + '...'
          : stringified;
      } catch {
        return 'Error response from leakcheck API';
      }
    }

    try {
      return JSON.stringify(errorData);
    } catch {
      return 'Unknown error format';
    }
  }

  private mapLeakcheckStatusToHttpStatus(leakcheckStatus: number): HttpStatus {
    switch (leakcheckStatus) {
      case 400:
        return HttpStatus.BAD_REQUEST;
      case 404:
        return HttpStatus.NOT_FOUND;
      case 429:
        return HttpStatus.TOO_MANY_REQUESTS;
      case 500:
      case 502:
      case 503:
        return HttpStatus.BAD_GATEWAY;
      default:
        return HttpStatus.BAD_GATEWAY;
    }
  }

  async checkEmail(email: string): Promise<LeakcheckResponseDto> {
    // Validate email format
    if (!email || (!email.includes('@') && email.length < 3)) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message:
            'Invalid email address or username provided. Must be a valid email or username (min 3 characters).',
          error: 'INVALID_INPUT',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Public API accepts: email, email hash (SHA256 truncated to 24 chars), or username (min 3 chars)
    const url = `${this.publicApiUrl}?check=${encodeURIComponent(email)}`;

    this.logger.log(`Checking for leaks: ${email}`);

    try {
      const resp: AxiosResponse<LeakcheckPublicApiResponse> = await axios.get(
        url,
        {
          headers: {
            Accept: 'application/json',
          },
          timeout: 10000,
        },
      );
      const data = resp.data;

      // Map public API response to our DTO format
      // Public API returns sources array, we need to convert to results array
      const items: LeakcheckItemDto[] = (
        Array.isArray(data.sources) ? data.sources : []
      ).map((source: LeakcheckPublicApiSource) => {
        const item: LeakcheckItemDto = {
          email: email, // Use the queried email/username
          source: {
            name: source.name,
            breach_date: source.date,
          },
          firstName: null, // Public API doesn't provide this
          lastName: null, // Public API doesn't provide this
          username: null, // Public API doesn't provide this
          fields: Array.isArray(data.fields) ? data.fields : [],
          lastSeen: source.date,
        };
        return item;
      });

      const normalized: LeakcheckResponseDto = {
        success: Boolean(data.success),
        found: Number(data.found ?? 0),
        quota: 0, // Public API doesn't provide quota info
        results: items,
      };

      this.logger.log(
        `Leakcheck completed for ${email}: ${normalized.found} breaches found`,
      );

      return normalized;
    } catch (err: any) {
      // Handle Axios errors (HTTP errors from leakcheck API)
      if (axios.isAxiosError(err) && err.response) {
        const leakcheckStatus = err.response.status || 500;
        const errorData = err.response.data;
        const errorMessage = this.extractErrorMessage(errorData);

        // Log the full error for debugging
        this.logger.error(
          `Leakcheck API error for ${email}: Status ${leakcheckStatus}, Message: ${errorMessage}`,
          JSON.stringify(errorData, null, 2),
        );

        // Map leakcheck API status to appropriate HTTP status
        const httpStatus = this.mapLeakcheckStatusToHttpStatus(leakcheckStatus);

        // Provide user-friendly error messages based on status
        let userMessage = errorMessage;
        let errorCode = 'LEAKCHECK_API_ERROR';

        // Check for specific error messages
        if (leakcheckStatus === 429) {
          userMessage =
            'Leakcheck API rate limit exceeded. Please try again later.';
          errorCode = 'LEAKCHECK_RATE_LIMIT';
        } else if (leakcheckStatus >= 500) {
          userMessage =
            'Leakcheck service is temporarily unavailable. Please try again later.';
          errorCode = 'LEAKCHECK_SERVICE_UNAVAILABLE';
        }

        throw new HttpException(
          {
            statusCode: httpStatus,
            message: userMessage,
            error: errorCode,
            details: errorMessage !== userMessage ? errorMessage : undefined,
          },
          httpStatus,
        );
      }

      // Handle network errors, timeouts, etc.
      if (axios.isAxiosError(err)) {
        this.logger.error(
          `Leakcheck network error for ${email}: ${err.message}`,
          err.stack,
        );

        if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
          throw new HttpException(
            {
              statusCode: HttpStatus.GATEWAY_TIMEOUT,
              message:
                'Leakcheck service request timed out. Please try again later.',
              error: 'LEAKCHECK_TIMEOUT',
            },
            HttpStatus.GATEWAY_TIMEOUT,
          );
        }

        if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
          throw new HttpException(
            {
              statusCode: HttpStatus.BAD_GATEWAY,
              message:
                'Unable to connect to leakcheck service. Please try again later.',
              error: 'LEAKCHECK_CONNECTION_ERROR',
            },
            HttpStatus.BAD_GATEWAY,
          );
        }
      }

      // Handle any other unexpected errors
      let errorMessage = 'Unknown error';
      let errorStack: string | undefined;

      if (err && typeof err === 'object') {
        const errorObj = err as Record<string, unknown>;
        if ('message' in errorObj && typeof errorObj.message === 'string') {
          errorMessage = errorObj.message;
        } else {
          errorMessage = String(err);
        }
        if ('stack' in errorObj && typeof errorObj.stack === 'string') {
          errorStack = errorObj.stack;
        }
      } else {
        errorMessage = String(err);
      }
      this.logger.error(
        `Unexpected error during leakcheck for ${email}: ${errorMessage}`,
        errorStack,
      );

      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_GATEWAY,
          message:
            'An unexpected error occurred while checking for leaks. Please try again later.',
          error: 'LEAKCHECK_UNKNOWN_ERROR',
        },
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
