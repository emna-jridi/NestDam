import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OllamaService } from './ollama.service';

describe('OllamaService', () => {
  let service: OllamaService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OllamaService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue: any) => {
              const config = {
                OLLAMA_HOST: 'http://localhost:11434',
                OLLAMA_MODEL: 'llama3.2',
                OLLAMA_TIMEOUT: 60000,
              };
              return config[key] ?? defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<OllamaService>(OllamaService);
    configService = module.get<ConfigService>(ConfigService);
  });

  describe('JSON parsing', () => {
    it('should parse valid JSON response', async () => {
      const jsonResponse = JSON.stringify({
        aiRiskScore: 65,
        aiRiskLevel: 'medium',
        summary: 'App has excessive permissions',
        recommendations: [
          'Review location access',
          'Disable microphone permission',
        ],
      });

      // Directly test private parseResponse (via reflection for testing)
      const result = (service as any).parseResponse(jsonResponse);

      expect(result.aiRiskScore).toBe(65);
      expect(result.aiRiskLevel).toBe('medium');
      expect(result.summary).toContain('excessive');
      expect(result.recommendations.length).toBe(2);
    });

    it('should fallback on invalid JSON', async () => {
      const invalidResponse = 'not json at all';
      const result = (service as any).parseResponse(invalidResponse);

      expect(result.aiRiskScore).toBe(50);
      expect(result.aiRiskLevel).toBe('medium');
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it('should clamp risk score to 0-100', async () => {
      const jsonResponse = JSON.stringify({
        aiRiskScore: 150,
        aiRiskLevel: 'critical',
        summary: 'Test',
        recommendations: ['Test'],
      });

      const result = (service as any).parseResponse(jsonResponse);
      expect(result.aiRiskScore).toBeLessThanOrEqual(100);
      expect(result.aiRiskScore).toBeGreaterThanOrEqual(0);
    });

    it('should validate risk level enum', async () => {
      const jsonResponse = JSON.stringify({
        aiRiskScore: 50,
        aiRiskLevel: 'invalid_level',
        summary: 'Test',
        recommendations: ['Test'],
      });

      const result = (service as any).parseResponse(jsonResponse);
      // Falls back to default response
      expect(['low', 'medium', 'high', 'critical']).toContain(result.aiRiskLevel);
    });

    it('should ensure recommendations array always populated', async () => {
      const jsonResponse = JSON.stringify({
        aiRiskScore: 45,
        aiRiskLevel: 'medium',
        summary: 'Test',
        recommendations: [],
      });

      const result = (service as any).parseResponse(jsonResponse);
      expect(Array.isArray(result.recommendations)).toBe(true);
      expect(result.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('default response', () => {
    it('should provide safe fallback response', async () => {
      const result = (service as any).getDefaultResponse();

      expect(result.aiRiskScore).toBe(50);
      expect(result.aiRiskLevel).toBe('medium');
      expect(result.summary).toBeTruthy();
      expect(result.recommendations.length).toBeGreaterThan(0);
    });
  });
});
