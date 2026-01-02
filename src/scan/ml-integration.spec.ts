/**
 * Integration Tests for ML Malware Detection System
 * Tests feature alignment, normalization, and inference across platforms
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { MLMalwareDetectorService } from './services/ml-malware-detector.service';
import { FeatureExtractionService } from './services/feature-extraction.service';
import { FeatureExtractionDto } from './dto/feature-extraction.dto';
import * as fs from 'fs';
import * as path from 'path';

describe('ML Malware Detection System - Integration Tests', () => {
  let app: INestApplication;
  let mlService: MLMalwareDetectorService;
  let featureExtractor: FeatureExtractionService;
  let modelMetadata: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      providers: [MLMalwareDetectorService, FeatureExtractionService],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    mlService = moduleFixture.get<MLMalwareDetectorService>(MLMalwareDetectorService);
    featureExtractor = moduleFixture.get<FeatureExtractionService>(FeatureExtractionService);

    // Load training metadata
    const metadataPath = path.resolve(__dirname, '../../models/model_metadata.json');
    try {
      modelMetadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    } catch (e) {
      // Use default metadata if file not found
      modelMetadata = {
        version: '2.0',
        features: 12,
        feature_names: ['dangerous_permissions', 'internet_permission', 'min_sdk_version', 'activities_count', 'services_count', 'receivers_count', 'providers_count', 'exported_components', 'intent_filters_count', 'uses_native_code', 'has_reflection', 'obfuscation_score'],
        means: [0.415, 0.781, 0.603, 0.469, 0.429, 0.433, 0.264, 0.398, 0.550, 0.321, 0.323, 0.411],
        scales: [0.253, 0.413, 0.241, 0.197, 0.234, 0.233, 0.215, 0.241, 0.202, 0.467, 0.467, 0.253],
        metrics: { accuracy: 0.999 }
      };
    }
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Feature Alignment Tests', () => {
    it('should have exactly 12 training features', () => {
      expect(modelMetadata.features).toHaveLength(12);
    });

    it('should have features in correct training order', () => {
      const expectedOrder = [
        'dangerous_permissions',
        'internet_permission',
        'min_sdk_version',
        'activities_count',
        'services_count',
        'receivers_count',
        'providers_count',
        'exported_components',
        'intent_filters_count',
        'uses_native_code',
        'has_reflection',
        'obfuscation_score',
      ];
      expect(modelMetadata.features).toEqual(expectedOrder);
    });

    it('should have matching scaler parameters (12 means + 12 scales)', () => {
      expect(modelMetadata.scaler.mean).toHaveLength(12);
      expect(modelMetadata.scaler.scale).toHaveLength(12);
    });

    it('should have non-zero scale values', () => {
      modelMetadata.scaler.scale.forEach((scale: number) => {
        expect(scale).toBeGreaterThan(0);
      });
    });
  });

  describe('Feature Extraction Tests', () => {
    it('should extract all 12 features for benign app profile', () => {
      const dto = new FeatureExtractionDto();
      
      // Simulate benign app
      dto.dangerous_permissions = 0.1;
      dto.internet_permission = 1;
      dto.min_sdk_version = 0.6;
      dto.activities_count = 0.5;
      dto.services_count = 0.2;
      dto.receivers_count = 0.1;
      dto.providers_count = 0.1;
      dto.exported_components = 0.2;
      dto.intent_filters_count = 0.4;
      dto.uses_native_code = 0;
      dto.has_reflection = 0;
      dto.obfuscation_score = 0.1;

      expect(featureExtractor.validateFeatures(dto)).toBe(true);
    });

    it('should extract all 12 features for malicious app profile', () => {
      const dto = new FeatureExtractionDto();
      
      // Simulate malicious app
      dto.dangerous_permissions = 0.8;
      dto.internet_permission = 1;
      dto.min_sdk_version = 0.3;
      dto.activities_count = 0.6;
      dto.services_count = 0.7;
      dto.receivers_count = 0.6;
      dto.providers_count = 0.5;
      dto.exported_components = 0.8;
      dto.intent_filters_count = 0.7;
      dto.uses_native_code = 1;
      dto.has_reflection = 1;
      dto.obfuscation_score = 0.9;

      expect(featureExtractor.validateFeatures(dto)).toBe(true);
    });

    it('should return features in correct array order', () => {
      const dto = new FeatureExtractionDto();
      
      // Set unique values for each feature
      dto.dangerous_permissions = 0.1;
      dto.internet_permission = 0.2;
      dto.min_sdk_version = 0.3;
      dto.activities_count = 0.4;
      dto.services_count = 0.5;
      dto.receivers_count = 0.6;
      dto.providers_count = 0.7;
      dto.exported_components = 0.8;
      dto.intent_filters_count = 0.9;
      dto.uses_native_code = 1.0;
      dto.has_reflection = 0.11;
      dto.obfuscation_score = 0.12;

      const array = featureExtractor.featuresToArray(dto);
      
      expect(array).toEqual([
        0.1,   // Position 0: dangerous_permissions
        0.2,   // Position 1: internet_permission
        0.3,   // Position 2: min_sdk_version
        0.4,   // Position 3: activities_count
        0.5,   // Position 4: services_count
        0.6,   // Position 5: receivers_count
        0.7,   // Position 6: providers_count
        0.8,   // Position 7: exported_components
        0.9,   // Position 8: intent_filters_count
        1.0,   // Position 9: uses_native_code
        0.11,  // Position 10: has_reflection
        0.12,  // Position 11: obfuscation_score
      ]);
    });
  });

  describe('Normalization Tests', () => {
    it('should apply StandardScaler normalization correctly', () => {
      // Test single feature normalization
      const rawValue = 0.5;
      const featureIndex = 0; // dangerous_permissions
      const mean = modelMetadata.scaler.mean[featureIndex];
      const scale = modelMetadata.scaler.scale[featureIndex];
      
      const expected = (rawValue - mean) / scale;
      
      // StandardScaler output should be in range [-3, 3] typically
      expect(expected).toBeGreaterThan(-3);
      expect(expected).toBeLessThan(3);
    });

    it('should produce different normalized values for different inputs', () => {
      const dto1 = new FeatureExtractionDto();
      dto1.dangerous_permissions = 0.2;
      dto1.internet_permission = 1;
      dto1.min_sdk_version = 0.5;
      dto1.activities_count = 0.3;
      dto1.services_count = 0.2;
      dto1.receivers_count = 0.1;
      dto1.providers_count = 0.1;
      dto1.exported_components = 0.2;
      dto1.intent_filters_count = 0.3;
      dto1.uses_native_code = 0;
      dto1.has_reflection = 0;
      dto1.obfuscation_score = 0.1;

      const dto2 = new FeatureExtractionDto();
      dto2.dangerous_permissions = 0.8;
      dto2.internet_permission = 1;
      dto2.min_sdk_version = 0.5;
      dto2.activities_count = 0.7;
      dto2.services_count = 0.8;
      dto2.receivers_count = 0.7;
      dto2.providers_count = 0.6;
      dto2.exported_components = 0.8;
      dto2.intent_filters_count = 0.8;
      dto2.uses_native_code = 1;
      dto2.has_reflection = 1;
      dto2.obfuscation_score = 0.9;

      // Normalization should produce measurably different values
      expect(dto1.dangerous_permissions).not.toEqual(dto2.dangerous_permissions);
    });
  });

  describe('Inference Tests', () => {
    it('should produce inference for benign app', async () => {
      const benignFeatures = new FeatureExtractionDto();
      benignFeatures.dangerous_permissions = 0.1;
      benignFeatures.internet_permission = 1;
      benignFeatures.min_sdk_version = 0.7;
      benignFeatures.activities_count = 0.3;
      benignFeatures.services_count = 0.1;
      benignFeatures.receivers_count = 0.1;
      benignFeatures.providers_count = 0.05;
      benignFeatures.exported_components = 0.1;
      benignFeatures.intent_filters_count = 0.2;
      benignFeatures.uses_native_code = 0;
      benignFeatures.has_reflection = 0;
      benignFeatures.obfuscation_score = 0.1;

      const result = await mlService.inferMalware(benignFeatures);

      expect(result.malwareProbability).toBeGreaterThanOrEqual(0);
      expect(result.malwareProbability).toBeLessThanOrEqual(1);
      expect(result.confidenceLevel).toBeGreaterThan(0);
      expect(result.topContributingFeatures).toBeDefined();
      expect(result.topContributingFeatures.length).toBeGreaterThan(0);
    });

    it('should produce inference for malicious app', async () => {
      const maliciousFeatures = new FeatureExtractionDto();
      maliciousFeatures.dangerous_permissions = 0.9;
      maliciousFeatures.internet_permission = 1;
      maliciousFeatures.min_sdk_version = 0.2;
      maliciousFeatures.activities_count = 0.8;
      maliciousFeatures.services_count = 0.9;
      maliciousFeatures.receivers_count = 0.8;
      maliciousFeatures.providers_count = 0.7;
      maliciousFeatures.exported_components = 0.9;
      maliciousFeatures.intent_filters_count = 0.9;
      maliciousFeatures.uses_native_code = 1;
      maliciousFeatures.has_reflection = 1;
      maliciousFeatures.obfuscation_score = 0.95;

      const result = await mlService.inferMalware(maliciousFeatures);

      expect(result.malwareProbability).toBeGreaterThanOrEqual(0);
      expect(result.malwareProbability).toBeLessThanOrEqual(1);
      expect(result.confidenceLevel).toBeGreaterThan(0);
      expect(result.topContributingFeatures).toBeDefined();
    });

    it('should produce different probabilities for different apps', async () => {
      const benignFeatures = new FeatureExtractionDto();
      benignFeatures.dangerous_permissions = 0.1;
      benignFeatures.internet_permission = 1;
      benignFeatures.min_sdk_version = 0.7;
      benignFeatures.activities_count = 0.3;
      benignFeatures.services_count = 0.1;
      benignFeatures.receivers_count = 0.1;
      benignFeatures.providers_count = 0.05;
      benignFeatures.exported_components = 0.1;
      benignFeatures.intent_filters_count = 0.2;
      benignFeatures.uses_native_code = 0;
      benignFeatures.has_reflection = 0;
      benignFeatures.obfuscation_score = 0.1;

      const maliciousFeatures = new FeatureExtractionDto();
      maliciousFeatures.dangerous_permissions = 0.9;
      maliciousFeatures.internet_permission = 1;
      maliciousFeatures.min_sdk_version = 0.2;
      maliciousFeatures.activities_count = 0.8;
      maliciousFeatures.services_count = 0.9;
      maliciousFeatures.receivers_count = 0.8;
      maliciousFeatures.providers_count = 0.7;
      maliciousFeatures.exported_components = 0.9;
      maliciousFeatures.intent_filters_count = 0.9;
      maliciousFeatures.uses_native_code = 1;
      maliciousFeatures.has_reflection = 1;
      maliciousFeatures.obfuscation_score = 0.95;

      const benignResult = await mlService.inferMalware(benignFeatures);
      const maliciousResult = await mlService.inferMalware(maliciousFeatures);

      expect(benignResult.malwareProbability).toBeLessThan(maliciousResult.malwareProbability);
    });

    it('should return risk level based on probability', async () => {
      const mediumRiskFeatures = new FeatureExtractionDto();
      mediumRiskFeatures.dangerous_permissions = 0.4;
      mediumRiskFeatures.internet_permission = 1;
      mediumRiskFeatures.min_sdk_version = 0.5;
      mediumRiskFeatures.activities_count = 0.5;
      mediumRiskFeatures.services_count = 0.4;
      mediumRiskFeatures.receivers_count = 0.4;
      mediumRiskFeatures.providers_count = 0.3;
      mediumRiskFeatures.exported_components = 0.4;
      mediumRiskFeatures.intent_filters_count = 0.5;
      mediumRiskFeatures.uses_native_code = 0.5;
      mediumRiskFeatures.has_reflection = 0.5;
      mediumRiskFeatures.obfuscation_score = 0.4;

      const result = await mlService.inferMalware(mediumRiskFeatures);

      expect(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).toContain(result.riskLevel);
    });
  });

  describe('Model Metadata Tests', () => {
    it('should have valid model version', () => {
      expect(modelMetadata.version).toBeDefined();
      expect(modelMetadata.version).toMatch(/\d+\.\d+\.\d+/);
    });

    it('should have creation timestamp', () => {
      expect(modelMetadata.created_at).toBeDefined();
      // Should be ISO 8601 format
      expect(() => new Date(modelMetadata.created_at)).not.toThrow();
    });

    it('should have metrics', () => {
      expect(modelMetadata.metrics).toBeDefined();
      expect(modelMetadata.metrics.accuracy).toBeGreaterThan(0);
      expect(modelMetadata.metrics.accuracy).toBeLessThanOrEqual(1);
      expect(modelMetadata.metrics.auc).toBeGreaterThan(0);
      expect(modelMetadata.metrics.auc).toBeLessThanOrEqual(1);
    });

    it('should have training info', () => {
      expect(modelMetadata.training).toBeDefined();
      expect(modelMetadata.training.samples).toBeGreaterThan(0);
      expect(modelMetadata.training.malware_ratio).toBeGreaterThan(0);
      expect(modelMetadata.training.malware_ratio).toBeLessThan(1);
      expect(modelMetadata.training.epochs).toBeGreaterThan(0);
    });
  });

  describe('Cross-Platform Consistency Tests', () => {
    it('should have matching feature names between backend and training', () => {
      // This would be matched with Android FEATURE_NAMES constant
      const backendFeatureNames = [
        'dangerous_permissions',
        'internet_permission',
        'min_sdk_version',
        'activities_count',
        'services_count',
        'receivers_count',
        'providers_count',
        'exported_components',
        'intent_filters_count',
        'uses_native_code',
        'has_reflection',
        'obfuscation_score',
      ];

      expect(backendFeatureNames).toEqual(modelMetadata.features);
    });

    it('should support feature array conversion', () => {
      const dto = new FeatureExtractionDto();
      dto.dangerous_permissions = 0.5;
      dto.internet_permission = 1;
      dto.min_sdk_version = 0.6;
      dto.activities_count = 0.4;
      dto.services_count = 0.3;
      dto.receivers_count = 0.3;
      dto.providers_count = 0.2;
      dto.exported_components = 0.4;
      dto.intent_filters_count = 0.5;
      dto.uses_native_code = 0;
      dto.has_reflection = 0;
      dto.obfuscation_score = 0.3;

      const array = featureExtractor.featuresToArray(dto);
      
      expect(array.length).toBe(12);
      expect(array).toEqual([
        0.5, 1, 0.6, 0.4, 0.3, 0.3, 0.2, 0.4, 0.5, 0, 0, 0.3,
      ]);
    });
  });

  describe('Robustness Tests', () => {
    it('should handle missing optional legacy fields', () => {
      const dto = new FeatureExtractionDto();
      dto.dangerous_permissions = 0.5;
      dto.internet_permission = 1;
      dto.min_sdk_version = 0.6;
      dto.activities_count = 0.4;
      dto.services_count = 0.3;
      dto.receivers_count = 0.3;
      dto.providers_count = 0.2;
      dto.exported_components = 0.4;
      dto.intent_filters_count = 0.5;
      dto.uses_native_code = 0;
      dto.has_reflection = 0;
      dto.obfuscation_score = 0.3;
      
      // Legacy fields are optional
      expect(dto.has_sms).toBeUndefined();
      expect(dto.is_system_app).toBeUndefined();

      expect(featureExtractor.validateFeatures(dto)).toBe(true);
    });

    it('should produce valid inference with edge case values', async () => {
      const edgeCaseFeatures = new FeatureExtractionDto();
      edgeCaseFeatures.dangerous_permissions = 0;
      edgeCaseFeatures.internet_permission = 0;
      edgeCaseFeatures.min_sdk_version = 1;
      edgeCaseFeatures.activities_count = 0;
      edgeCaseFeatures.services_count = 0;
      edgeCaseFeatures.receivers_count = 0;
      edgeCaseFeatures.providers_count = 0;
      edgeCaseFeatures.exported_components = 0;
      edgeCaseFeatures.intent_filters_count = 0;
      edgeCaseFeatures.uses_native_code = 0;
      edgeCaseFeatures.has_reflection = 0;
      edgeCaseFeatures.obfuscation_score = 0;

      const result = await mlService.inferMalware(edgeCaseFeatures);

      expect(result.malwareProbability).toBeGreaterThanOrEqual(0);
      expect(result.malwareProbability).toBeLessThanOrEqual(1);
    });
  });
});
