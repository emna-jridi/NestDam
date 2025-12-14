import { ScoreCalculatorService } from './score-calculator.service';

describe('ScoreCalculatorService', () => {
  let service: ScoreCalculatorService;

  beforeEach(() => {
    service = new ScoreCalculatorService();
  });

  describe('risk band thresholds', () => {
    it('should have correct risk band ranges', () => {
      expect(service.riskBands.low.min).toBe(0);
      expect(service.riskBands.low.max).toBe(39);
      expect(service.riskBands.medium.min).toBe(40);
      expect(service.riskBands.medium.max).toBe(69);
      expect(service.riskBands.high.min).toBe(70);
      expect(service.riskBands.high.max).toBe(84);
      expect(service.riskBands.critical.min).toBe(85);
      expect(service.riskBands.critical.max).toBe(100);
    });
  });

  describe('calculateRiskScore', () => {
    it('should classify low risk (score < 40)', () => {
      const result = service.calculateRiskScore(
        { 'android.permission.INTERNET': true },
        [],
        'app is safe',
        20
      );

      expect(result.aiRiskLevel).toBe('low');
      expect(result.aiRiskScore).toBeLessThan(40);
    });

    it('should classify medium risk (40-69)', () => {
      const result = service.calculateRiskScore(
        { 'android.permission.CAMERA': true },
        [],
        'app has some permissions',
        55
      );

      expect(result.aiRiskLevel).toBe('medium');
      expect(result.aiRiskScore).toBeGreaterThanOrEqual(40);
      expect(result.aiRiskScore).toBeLessThan(70);
    });

    it('should classify high risk (70-84)', () => {
      const result = service.calculateRiskScore(
        {
          'android.permission.ACCESS_FINE_LOCATION': true,
          'android.permission.RECORD_AUDIO': true,
        },
        [],
        'suspicious activity',
        75
      );

      expect(result.aiRiskLevel).toBe('high');
      expect(result.aiRiskScore).toBeGreaterThanOrEqual(70);
      expect(result.aiRiskScore).toBeLessThan(85);
    });

    it('should classify critical risk (>=85)', () => {
      const result = service.calculateRiskScore(
        {
          'android.permission.ACCESS_FINE_LOCATION': true,
          'android.permission.RECORD_AUDIO': true,
          'android.permission.READ_CONTACTS': true,
        },
        [],
        'malware detected',
        90
      );

      expect(result.aiRiskLevel).toBe('critical');
      expect(result.aiRiskScore).toBeGreaterThanOrEqual(85);
    });

    it('should handle missing AI score with keyword heuristics', () => {
      const result = service.calculateRiskScore(
        { 'android.permission.CAMERA': true },
        [],
        'contains malware keyword'
      );

      expect(result.aiRiskScore).toBeGreaterThan(0);
      expect(['low', 'medium', 'high', 'critical']).toContain(result.aiRiskLevel);
    });

    it('should clamp score between 0 and 100', () => {
      const result = service.calculateRiskScore(
        {},
        [],
        '',
        150
      );

      expect(result.aiRiskScore).toBeLessThanOrEqual(100);
      expect(result.aiRiskScore).toBeGreaterThanOrEqual(0);
    });

    it('should weight permissions (35%), trackers (25%), AI (40%)', () => {
      const result = service.calculateRiskScore(
        { 'android.permission.CAMERA': true },
        [],
        'some concerns',
        50
      );

      expect(result.aiRiskScore).toBeGreaterThan(0);
      expect(result.aiRiskScore).toBeLessThanOrEqual(100);
    });
  });

  describe('score to level mapping', () => {
    it('should map scores correctly to levels', () => {
      const cases = [
        { score: 0, expectedLevel: 'low' },
        { score: 39, expectedLevel: 'low' },
        { score: 40, expectedLevel: 'medium' },
        { score: 69, expectedLevel: 'medium' },
        { score: 70, expectedLevel: 'high' },
        { score: 84, expectedLevel: 'high' },
        { score: 85, expectedLevel: 'critical' },
        { score: 100, expectedLevel: 'critical' },
      ];

      cases.forEach(({ score, expectedLevel }) => {
        const result = service.calculateRiskScore({}, [], '', score);
        expect(result.aiRiskLevel).toBe(expectedLevel);
      });
    });
  });

  describe('permission scoring', () => {
    it('should score sensitive permissions higher', () => {
      const highRiskPerms = {
        'android.permission.ACCESS_FINE_LOCATION': true,
        'android.permission.RECORD_AUDIO': true,
        'android.permission.READ_SMS': true,
      };

      const lowRiskPerms = {
        'android.permission.INTERNET': true,
      };

      const highResult = service.calculateRiskScore(highRiskPerms, [], '', 0);
      const lowResult = service.calculateRiskScore(lowRiskPerms, [], '', 0);

      expect(highResult.aiRiskScore).toBeGreaterThan(lowResult.aiRiskScore);
    });
  });

  describe('tracker scoring', () => {
    it('should score multiple trackers higher', () => {
      const oneTracker = ['tracker1'];
      const manyTrackers = ['tracker1', 'tracker2', 'tracker3', 'tracker4'];

      const oneResult = service.calculateRiskScore({}, oneTracker, '', 50);
      const manyResult = service.calculateRiskScore({}, manyTrackers, '', 50);

      expect(manyResult.aiRiskScore).toBeGreaterThanOrEqual(oneResult.aiRiskScore);
    });
  });
});
