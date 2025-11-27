import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

export interface OpenRouterResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

@Injectable()
export class OpenRouterAiService {
  private readonly logger = new Logger(OpenRouterAiService.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://openrouter.ai/api/v1';
  private readonly model = 'meta-llama/llama-3.1-70b-instruct'; 

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    this.apiKey = this.config.get<string>('OPENROUTER_API_KEY') || '';
  }

  /**
   * ✅ Appeler OpenRouter avec un prompt
   */
  async complete(
    systemPrompt: string,
    userPrompt: string,
    temperature: number = 0.7,
  ): Promise<string> {
    if (!this.apiKey) {
      throw new Error('OPENROUTER_API_KEY not configured');
    }

    try {
      this.logger.debug('Calling OpenRouter API...');

      const response = await firstValueFrom(
        this.http.post<OpenRouterResponse>(
          `${this.baseUrl}/chat/completions`,
          {
            model: this.model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature,
            max_tokens: 1000,
          },
          {
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://shadowguard.app', // ✅ Requis par OpenRouter
              'X-Title': 'ShadowGuard',
            },
            timeout: 20000, // 20s (OpenRouter peut être plus lent que Groq)
          },
        ),
      );

      const content = response.data.choices[0].message.content;

      this.logger.debug('OpenRouter response received');

      return content;
    } catch (error) {
      this.logger.error(`OpenRouter API failed: ${error.message}`);
      
      // Meilleur message d'erreur
      if (error.response?.status === 401) {
        throw new Error('Invalid OpenRouter API key. Check your .env file.');
      }
      if (error.response?.status === 429) {
        throw new Error('OpenRouter rate limit exceeded. Try again in a few minutes.');
      }
      
      throw error;
    }
  }

  /**
   * ✅ Parser réponse JSON d'OpenRouter
   */
  parseJsonResponse<T>(content: string): T {
    try {
      // Nettoyer le markdown si présent
      let cleaned = content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      // Extraire le JSON si entouré de texte
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleaned = jsonMatch[0];
      }

      return JSON.parse(cleaned);
    } catch (error) {
      this.logger.error(`Failed to parse OpenRouter JSON: ${content}`);
      throw new Error('Invalid JSON response from OpenRouter');
    }
  }

  /**
   * ✅ Vérifier si la clé API est configurée
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }
}