import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

interface OllamaResponse {
  model: string;
  response: string;
  created_at: string;
  done: boolean;
  total_duration: number;
  load_duration: number;
  prompt_eval_count: number;
  prompt_eval_duration: number;
  eval_count: number;
  eval_duration: number;
}

@Injectable()
export class OllamaService {
  private logger = new Logger(OllamaService.name);
  private ollamaUrl: string;
  private ollamaModel: string;
  private ollamaTimeout: number;
  private maxRetries: number = 2;
  private retryDelay: number = 1000; // ms
  private httpClient: AxiosInstance;
  private isHealthy: boolean = true;

  constructor(private configService: ConfigService) {
    this.ollamaUrl = this.configService.get<string>('OLLAMA_HOST', 'http://localhost:11434');
    this.ollamaModel = this.configService.get<string>('OLLAMA_MODEL', 'llama3.2');
    // Increased from 15s to 60s to avoid premature timeouts
    this.ollamaTimeout = this.configService.get<number>('OLLAMA_TIMEOUT', 60000);

    this.httpClient = axios.create({
      baseURL: this.ollamaUrl,
      timeout: this.ollamaTimeout,
    });

    // Perform health check on startup (non-blocking)
    this.performStartupHealthCheck();
  }

  /**
   * Perform health check on startup (non-blocking)
   */
  private performStartupHealthCheck(): void {
    setImmediate(async () => {
      try {
        const healthy = await this.checkHealth();
        if (healthy) {
          this.logger.log('✓ Ollama service is healthy and ready');
        } else {
          this.logger.warn('⚠ Ollama service is not available - using fallback mode');
        }
      } catch (error: any) {
        this.logger.warn(
          `⚠ Ollama health check error on startup: ${error.message} - will retry on first use`,
        );
      }
    });
  }

  /**
   * Check if Ollama service is available
   */
  private async checkHealth(): Promise<boolean> {
    try {
      await this.httpClient.get('/api/tags', { timeout: 5000 });
      this.isHealthy = true;
      this.logger.log('Ollama service is healthy');
      return true;
    } catch (error) {
      this.isHealthy = false;
      this.logger.warn(`Ollama service health check failed: ${(error as any).message}`);
      return false;
    }
  }

  /**
   * Analyze app security with retry logic and fallback
   * Returns: { summary, recommendations, usedFallback }
   */
  async analyzeAppSecurity(appInfo: string): Promise<{
    summary: string;
    recommendations: string[];
    aiRiskScore: number;
    aiRiskLevel: 'low' | 'medium' | 'high' | 'critical';
    usedFallback: boolean;
    aiStatus: 'ok' | 'fallback';
  }> {
    // Return fast fail if known to be unhealthy
    if (!this.isHealthy) {
      this.logger.warn('Ollama service is marked as unhealthy, using fallback');
      return {
        ...this.getDefaultResponse(),
        usedFallback: true,
        aiStatus: 'fallback',
      };
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        this.logger.debug(`[Ollama] Attempt ${attempt}/${this.maxRetries} to analyze`);
        const result = await this.performAnalysis(appInfo);
        this.logger.log(`[Ollama] ✅ Analysis succeeded on attempt ${attempt}`);
        return {
          ...result,
          usedFallback: false,
          aiStatus: 'ok',
        };
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(
          `[Ollama] Attempt ${attempt}/${this.maxRetries} failed: ${lastError.message}`,
        );

        if ((lastError as any)?.code === 'ECONNABORTED' || lastError.message.includes('timeout')) {
          this.logger.warn('[Ollama] Timeout detected - using fallback immediately');
          return {
            ...this.getDefaultResponse(),
            usedFallback: true,
            aiStatus: 'fallback',
          };
        }

        if (attempt < this.maxRetries) {
          await this.delay(this.retryDelay * attempt); // Exponential backoff
        }
      }
    }

    this.isHealthy = false;
    this.logger.error(
      `[Ollama] ❌ Analysis failed after ${this.maxRetries} attempts (${lastError?.message}) - USING FALLBACK`,
    );

    return {
      ...this.getDefaultResponse(),
      usedFallback: true,
      aiStatus: 'fallback',
    };
  }

  /**
   * Perform the actual analysis with Ollama
   */
  private async performAnalysis(appInfo: string): Promise<{
    summary: string;
    recommendations: string[];
    aiRiskScore: number;
    aiRiskLevel: 'low' | 'medium' | 'high' | 'critical';
  }> {
    const prompt = this.buildSecurityPrompt(appInfo);
    const analysisStart = Date.now();

    try {
      const response = await this.httpClient.post<OllamaResponse>('/api/generate', {
        model: this.ollamaModel,
        prompt,
        stream: false,
        temperature: 0.3,
        top_k: 40,
        top_p: 0.9,
      });

      const duration = Date.now() - analysisStart;
      this.logger.debug(`[Ollama] Response received in ${duration}ms`);

      if (!response.data || !response.data.response) {
        throw new Error('Invalid response from Ollama');
      }

      return this.parseResponse(response.data.response);
    } catch (error: any) {
      const duration = Date.now() - analysisStart;
      this.logger.error(`[Ollama] Error after ${duration}ms: ${error.message}`);

      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        this.logger.warn(`[Ollama] Timeout after ${duration}ms - consider increasing OLLAMA_TIMEOUT`);
      }

      throw error;
    }
  }

  /**
   * Build security analysis prompt
   */
  private buildSecurityPrompt(appInfo: string): string {
    return `You are a security analyst specializing in Android app security and privacy.
Return a STRICT JSON object with the following shape and nothing else:
{
  "aiRiskScore": number (0-100),
  "aiRiskLevel": "low" | "medium" | "high" | "critical",
  "summary": string,
  "recommendations": string[] (3-5 short, action-focused items)
}
Use the app info below and keep wording concise and neutral. Do not include explanations outside the JSON.

APP_INFO_START
${appInfo}
APP_INFO_END`;
  }

  /**
   * Parse Ollama response
   */
  private parseResponse(text: string): {
    summary: string;
    recommendations: string[];
    aiRiskScore: number;
    aiRiskLevel: 'low' | 'medium' | 'high' | 'critical';
  } {
    try {
      const parsed = JSON.parse(text.trim());
      const allowedLevels = new Set(['low', 'medium', 'high', 'critical']);

      if (
        typeof parsed !== 'object' ||
        typeof parsed.summary !== 'string' ||
        !Array.isArray(parsed.recommendations) ||
        typeof parsed.aiRiskScore !== 'number' ||
        typeof parsed.aiRiskLevel !== 'string'
      ) {
        throw new Error('Missing required JSON fields');
      }

      const aiRiskScore = Math.min(100, Math.max(0, Math.round(parsed.aiRiskScore)));
      const aiRiskLevel = parsed.aiRiskLevel.toLowerCase();
      if (!allowedLevels.has(aiRiskLevel)) {
        throw new Error('Invalid aiRiskLevel value');
      }

      const recommendations = parsed.recommendations
        .map((r: any) => (typeof r === 'string' ? r.trim() : ''))
        .filter((r: string) => r.length > 0)
        .slice(0, 5);

      return {
        summary: parsed.summary.toString().trim().substring(0, 500) || 'Security analysis completed.',
        recommendations: recommendations.length > 0
          ? recommendations
          : ['Review app permissions and data access carefully.'],
        aiRiskScore,
        aiRiskLevel,
      };
    } catch (error) {
      this.logger.warn(`Error parsing Ollama response as JSON: ${(error as any).message}`);
      return {
        ...this.getDefaultResponse(),
      };
    }
  }

  /**
   * Get default response when Ollama is unavailable (fallback mode)
   */
  private getDefaultResponse(): {
    summary: string;
    recommendations: string[];
    aiRiskScore: number;
    aiRiskLevel: 'low' | 'medium' | 'high' | 'critical';
  } {
    return {
      summary:
        'AI security analysis is currently unavailable. Ensure Ollama is running at ' +
        this.ollamaUrl +
        '. Using heuristic scoring based on permissions and store data.',
      recommendations: [
        'Check app permissions for excessive access to sensitive data',
        'Review privacy policy for data collection practices',
        'Verify app is from official store (Google Play)',
        'Monitor network activity for unusual data transmission',
        'Keep app updated to latest version',
      ],
      aiRiskScore: 50,
      aiRiskLevel: 'medium',
    };
  }

  /**
   * Utility: sleep for specified milliseconds
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get Ollama service status
   */
  async getStatus(): Promise<{
    available: boolean;
    model: string;
    url: string;
    timeout: number;
  }> {
    const healthy = await this.checkHealth();
    return {
      available: healthy,
      model: this.ollamaModel,
      url: this.ollamaUrl,
      timeout: this.ollamaTimeout,
    };
  }
}
