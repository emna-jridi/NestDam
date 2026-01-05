import { Test, TestingModule } from '@nestjs/testing';
import { ScoringService } from './scoring.service';

describe('ScoringService', () => {
  let service: ScoringService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ScoringService],
    }).compile();

    service = module.get<ScoringService>(ScoringService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculateConfidenceScore', () => {
    it('should return low confidence when malware probability is near 0.5 (50%)', () => {
      // At 50% (indecision), confidence should be low
      const confidence = service.calculateConfidenceScore(0.5, 'SMART');
      expect(confidence).toBeLessThan(50);
    });

    it('should return high confidence when malware probability is clear benign (close to 0)', () => {
      // Clear benign (very low probability)
      const confidence = service.calculateConfidenceScore(0.05, 'SMART');
      expect(confidence).toBeGreaterThan(70);
    });

    it('should return high confidence when malware probability is clear malicious (close to 1)', () => {
      // Clear malicious (very high probability)
      const confidence = service.calculateConfidenceScore(0.95, 'SMART');
      expect(confidence).toBeGreaterThan(70);
    });

    it('should give DEEP scans slightly higher confidence than SMART', () => {
      const smartConfidence = service.calculateConfidenceScore(0.3, 'SMART');
      const deepConfidence = service.calculateConfidenceScore(0.3, 'DEEP');
      expect(deepConfidence).toBeGreaterThan(smartConfidence);
    });

    it('should return confidence between 0 and 100', () => {
      const testCases = [0, 0.25, 0.5, 0.75, 1.0];
      testCases.forEach((probability) => {
        const confidence = service.calculateConfidenceScore(probability, 'SMART');
        expect(confidence).toBeGreaterThanOrEqual(0);
        expect(confidence).toBeLessThanOrEqual(100);
      });
    });
  });

  describe('recommendDeepAnalysis', () => {
    it('should not recommend DEEP if already in DEEP mode', () => {
      const recommend = service.recommendDeepAnalysis('DEEP', 0.5, 'HIGH');
      expect(recommend).toBe(false);
    });

    it('should recommend DEEP if malware probability >= 0.35 in SMART mode', () => {
      const recommend = service.recommendDeepAnalysis('SMART', 0.35, 'LOW');
      expect(recommend).toBe(true);
    });

    it('should recommend DEEP if global risk is CRITICAL in SMART mode', () => {
      const recommend = service.recommendDeepAnalysis('SMART', 0.1, 'CRITICAL');
      expect(recommend).toBe(true);
    });

    it('should recommend DEEP if global risk is HIGH in SMART mode', () => {
      const recommend = service.recommendDeepAnalysis('SMART', 0.1, 'HIGH');
      expect(recommend).toBe(true);
    });

    it('should not recommend DEEP if all signals are benign in SMART mode', () => {
      const recommend = service.recommendDeepAnalysis('SMART', 0.1, 'LOW');
      expect(recommend).toBe(false);
    });

    it('should recommend DEEP for borderline malware probability (0.35)', () => {
      const recommend = service.recommendDeepAnalysis('SMART', 0.35, 'LOW');
      expect(recommend).toBe(true);
    });

    it('should not recommend DEEP for safe malware probability (0.34)', () => {
      const recommend = service.recommendDeepAnalysis('SMART', 0.34, 'LOW');
      expect(recommend).toBe(false);
    });
  });

  describe('calculateSecurityScore', () => {
    it('should calculate security score correctly', () => {
      // Benign app: no malware, no SAAT penalties, valid signature
      const score = service.calculateSecurityScore(0.1, 0, true);
      expect(score).toBeGreaterThan(90);
    });

    it('should penalize malware probability', () => {
      const benignScore = service.calculateSecurityScore(0.1, 0, true);
      const suspiciousScore = service.calculateSecurityScore(0.5, 0, true);
      expect(benignScore).toBeGreaterThan(suspiciousScore);
    });

    it('should penalize SAAT violations', () => {
      const cleanScore = service.calculateSecurityScore(0.1, 0, true);
      const suspiciousScore = service.calculateSecurityScore(0.1, 30, true);
      expect(cleanScore).toBeGreaterThan(suspiciousScore);
    });

    it('should penalize invalid signature', () => {
      const validScore = service.calculateSecurityScore(0.1, 0, true);
      const invalidScore = service.calculateSecurityScore(0.1, 0, false);
      expect(validScore).toBeGreaterThan(invalidScore);
      expect(validScore - invalidScore).toBe(20);
    });

    it('should clamp score between 0 and 100', () => {
      const lowScore = service.calculateSecurityScore(0.0, 0, true);
      const highScore = service.calculateSecurityScore(1.0, 100, false);
      expect(lowScore).toBeLessThanOrEqual(100);
      expect(highScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe('calculatePrivacyScore', () => {
    it('should calculate privacy score correctly', () => {
      // Clean app: no trackers, no excessive permissions
      const score = service.calculatePrivacyScore(0, 0, 0, 0, false, 0);
      expect(score).toBe(100);
    });

    it('should penalize advertising trackers', () => {
      const cleanScore = service.calculatePrivacyScore(0, 0, 0, 0, false, 0);
      const trackerScore = service.calculatePrivacyScore(3, 0, 0, 0, false, 0);
      expect(cleanScore).toBeGreaterThan(trackerScore);
      expect(cleanScore - trackerScore).toBe(30); // 3 * 10
    });

    it('should penalize location trackers heavily', () => {
      const baseScore = service.calculatePrivacyScore(0, 0, 0, 0, false, 0);
      const locationScore = service.calculatePrivacyScore(0, 0, 0, 1, false, 0);
      expect(baseScore - locationScore).toBe(15); // Location worth 15 points
    });

    it('should penalize excessive permissions', () => {
      const cleanScore = service.calculatePrivacyScore(0, 0, 0, 0, false, 0);
      const excessiveScore = service.calculatePrivacyScore(0, 0, 0, 0, true, 0);
      expect(cleanScore - excessiveScore).toBe(20);
    });

    it('should penalize multiple dangerous permissions', () => {
      const noDangerScore = service.calculatePrivacyScore(0, 0, 0, 0, false, 0);
      const someDangerScore = service.calculatePrivacyScore(0, 0, 0, 0, false, 10);
      // 10 dangerous permissions: (10-5)*3 = 15 penalty
      expect(noDangerScore - someDangerScore).toBe(15);
    });

    it('should clamp score between 0 and 100', () => {
      const lowScore = service.calculatePrivacyScore(0, 0, 0, 0, false, 0);
      const highScore = service.calculatePrivacyScore(100, 100, 100, 100, true, 100);
      expect(lowScore).toEqual(100);
      expect(highScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe('determineGlobalRisk', () => {
    it('should return CRITICAL if security score < 30', () => {
      const risk = service.determineGlobalRisk(25, 50);
      expect(risk).toBe('CRITICAL');
    });

    it('should return CRITICAL if privacy score < 20', () => {
      const risk = service.determineGlobalRisk(50, 15);
      expect(risk).toBe('CRITICAL');
    });

    it('should return HIGH if security score < 50', () => {
      const risk = service.determineGlobalRisk(45, 50);
      expect(risk).toBe('HIGH');
    });

    it('should return HIGH if privacy score < 40', () => {
      const risk = service.determineGlobalRisk(50, 35);
      expect(risk).toBe('HIGH');
    });

    it('should return MEDIUM if security score < 70', () => {
      const risk = service.determineGlobalRisk(65, 50);
      expect(risk).toBe('MEDIUM');
    });

    it('should return MEDIUM if privacy score < 60', () => {
      const risk = service.determineGlobalRisk(75, 55);
      expect(risk).toBe('MEDIUM');
    });

    it('should return LOW for safe scores', () => {
      const risk = service.determineGlobalRisk(80, 75);
      expect(risk).toBe('LOW');
    });
  });

  describe('calculateOverallScore', () => {
    it('should weight security at 60% and privacy at 40%', () => {
      // Security 80, Privacy 60
      // Expected: 80*0.6 + 60*0.4 = 48 + 24 = 72
      const overall = service.calculateOverallScore(80, 60);
      expect(overall).toBe(72);
    });

    it('should give security more weight than privacy', () => {
      // Both at 70, should equal 70
      // But if security is higher, overall should be higher
      const equalScore = service.calculateOverallScore(70, 70);
      const securityHigher = service.calculateOverallScore(80, 60);
      expect(securityHigher).toBeGreaterThan(equalScore);
    });

    it('should return average when scores are equal', () => {
      const overall = service.calculateOverallScore(75, 75);
      expect(overall).toBe(75);
    });

    it('should handle boundary values', () => {
      const minScore = service.calculateOverallScore(0, 0);
      const maxScore = service.calculateOverallScore(100, 100);
      expect(minScore).toBe(0);
      expect(maxScore).toBe(100);
    });
  });
});
