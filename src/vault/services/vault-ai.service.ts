import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { OllamaAdviceDto, PasswordMetricsDto } from '../dto/password-metrics.dto';

interface OllamaRequest {
    model: string;
    prompt: string;
    stream: boolean;
    format: string;
}

interface OllamaResponse {
    response: string;
}

@Injectable()
export class VaultAiService {
    private readonly logger = new Logger(VaultAiService.name);
    private readonly ollamaUrl: string;
    private readonly modelName: string;
    private readonly timeout: number;

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
    ) {
        this.ollamaUrl = (this.configService.get<string>('OLLAMA_HOST') || 'http://localhost:11434') + '/api/generate';
        this.modelName = this.configService.get<string>('OLLAMA_MODEL') || 'llama3';
        const timeoutEnv = this.configService.get<string>('OLLAMA_TIMEOUT');
        this.timeout = timeoutEnv ? parseInt(timeoutEnv, 10) : 10000;

        this.logger.log(`AI Configuration Loaded:`);
        this.logger.log(`- Model: ${this.modelName}`);
        this.logger.log(`- Timeout: ${this.timeout}ms`);
        this.logger.log(`- Host: ${this.ollamaUrl}`);
    }

    async analyze(metrics: PasswordMetricsDto): Promise<OllamaAdviceDto> {
        const prompt = this.buildPrompt(metrics);

        try {
            const { data } = await firstValueFrom(
                this.httpService.post<OllamaResponse>(
                    this.ollamaUrl,
                    {
                        model: this.modelName,
                        prompt: prompt,
                        stream: false,
                        format: 'json',
                    },
                    {
                        timeout: this.timeout,
                    },
                ),
            );

            // Parse nested JSON in response field if needed, logic depends on Ollama output. 
            // Usually Ollama 'json' mode returns object in 'response'.
            let advice: OllamaAdviceDto;
            try {
                advice = JSON.parse(data.response);
            } catch (parseError) {
                this.logger.warn('Failed to parse Ollama JSON response, using raw text or fallback.');
                throw new Error('Invalid JSON from AI');
            }

            return advice;
            return advice;
        } catch (error) {
            if (error.response) {
                this.logger.error(`Ollama Error: Status ${error.response.status} - ${JSON.stringify(error.response.data)}`);
                if (error.response.status === 404) {
                    this.logger.warn(`Model '${this.modelName}' not found. Run 'ollama pull ${this.modelName}'`);
                }
            } else if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
                this.logger.warn(`Ollama Request Timed Out (${this.timeout}ms). The model might be loading. Try increasing OLLAMA_TIMEOUT in .env to 60000.`);
            } else {
                this.logger.error(`Ollama Connection Failed: ${error.message}`);
            }

            // Fallback
            return this.getFallbackAdvice(metrics.score);
        }
    }

    private buildPrompt(metrics: PasswordMetricsDto): string {
        return `
      You are a cybersecurity assistant.
      
      INPUT METRICS (Zero-Knowledge: Password not provided):
      Length: ${metrics.length}
      Entropy: ${metrics.entropy}
      Score: ${metrics.score}/100
      Issues: ${metrics.issues.join(', ') || 'none'}
      Crack Time Estimate: ${metrics.estimatedCrackTime}
      
      OUTPUT:
      Return STRICT JSON ONLY with:
      {
        "summary": "short educational explanation (max 1 sentence)",
        "recommendations": ["max 3 concrete improvements"],
        "tone": "educational"
      }
      
      Do NOT behave like a chatbot. Output ONLY the JSON.
    `;
    }

    private getFallbackAdvice(score: number): OllamaAdviceDto {
        const isStrong = score >= 70;
        return {
            summary: isStrong
                ? 'Local Analysis: Excellent password strength.'
                : 'Local Analysis: Password could be strengthened.',
            recommendations: isStrong
                ? ['Store securely in Vault']
                : ['Increase length', 'Use mixed characters'],
            tone: isStrong ? 'positive' : 'educational',
        };
    }
}
