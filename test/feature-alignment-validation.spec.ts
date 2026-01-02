/**
 * Feature Alignment Validation Test
 * Ensures backend features match training model features exactly
 */

import { Test } from '@nestjs/testing';
import { MLMalwareDetectorService } from '../src/scan/services/ml-malware-detector.service';
import { FeatureExtractionDto } from '../src/scan/dto/feature-extraction.dto';
import * as fs from 'fs';
import * as path from 'path';

describe('Feature Alignment Validation', () => {
  let mlService: MLMalwareDetectorService;
  const modelMetadataPath = path.resolve(__dirname, '../models/model_metadata.json');

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [MLMalwareDetectorService],
    }).compile();

    mlService = moduleRef.get<MLMalwareDetectorService>(MLMalwareDetectorService);
  });

  it('should have model metadata file', () => {
    expect(fs.existsSync(modelMetadataPath)).toBe(true);
  });

  it('should match training feature names exactly', () => {
    const metadata = JSON.parse(fs.readFileSync(modelMetadataPath, 'utf-8'));
    const trainingFeatures = metadata.features;

    // Expected features from training
    const expectedFeatures = [
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

    expect(trainingFeatures).toEqual(expectedFeatures);
  });

  it('should produce feature array in correct order', async () => {
    const testDto = new FeatureExtractionDto();
    
    // Set unique values for each feature to verify order
    testDto.dangerous_permissions = 0.1;
    testDto.internet_permission = 0.2;
    testDto.min_sdk_version = 0.3;
    testDto.activities_count = 0.4;
    testDto.services_count = 0.5;
    testDto.receivers_count = 0.6;
    testDto.providers_count = 0.7;
    testDto.exported_components = 0.8;
    testDto.intent_filters_count = 0.9;
    testDto.uses_native_code = 1.0;
    testDto.has_reflection = 0.11;
    testDto.obfuscation_score = 0.12;

    // Access private method through reflection (for testing purposes)
    const dtoToFeatureArray = (mlService as any).dtoToFeatureArray.bind(mlService);
    const featureArray = dtoToFeatureArray(testDto);

    expect(featureArray).toEqual([
      0.1,  // dangerous_permissions
      0.2,  // internet_permission
      0.3,  // min_sdk_version
      0.4,  // activities_count
      0.5,  // services_count
      0.6,  // receivers_count
      0.7,  // providers_count
      0.8,  // exported_components
      0.9,  // intent_filters_count
      1.0,  // uses_native_code
      0.11, // has_reflection
      0.12, // obfuscation_score
    ]);
  });

  it('should have correct number of features', () => {
    const testDto = new FeatureExtractionDto();
    testDto.dangerous_permissions = 0;
    testDto.internet_permission = 1;
    testDto.min_sdk_version = 0.5;
    testDto.activities_count = 0.3;
    testDto.services_count = 0.2;
    testDto.receivers_count = 0.1;
    testDto.providers_count = 0.1;
    testDto.exported_components = 0.4;
    testDto.intent_filters_count = 0.5;
    testDto.uses_native_code = 0;
    testDto.has_reflection = 0;
    testDto.obfuscation_score = 0.2;

    const dtoToFeatureArray = (mlService as any).dtoToFeatureArray.bind(mlService);
    const featureArray = dtoToFeatureArray(testDto);

    expect(featureArray.length).toBe(12);
  });

  it('should use StandardScaler normalization parameters from metadata', () => {
    const metadata = JSON.parse(fs.readFileSync(modelMetadataPath, 'utf-8'));
    
    expect(metadata.scaler).toBeDefined();
    expect(metadata.scaler.mean).toBeDefined();
    expect(metadata.scaler.scale).toBeDefined();
    expect(metadata.scaler.mean.length).toBe(12);
    expect(metadata.scaler.scale.length).toBe(12);
  });

  it('should detect feature name changes from training', () => {
    const metadata = JSON.parse(fs.readFileSync(modelMetadataPath, 'utf-8'));
    
    // These old feature names should NOT be in training metadata
    const deprecatedFeatures = [
      'has_sms',
      'has_location',
      'has_camera',
      'has_contacts',
      'has_storage',
      'is_system_app',
      'app_size_mb',
      'signature_valid',
    ];

    deprecatedFeatures.forEach(feature => {
      expect(metadata.features).not.toContain(feature);
    });
  });
});

describe('Feature Extraction Alignment', () => {
  it('DTO should have all training features as required fields', () => {
    const dto = new FeatureExtractionDto();
    
    const requiredFields = [
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

    requiredFields.forEach(field => {
      expect(field in dto).toBe(true);
    });
  });

  it('Legacy fields should be optional', () => {
    const dto = new FeatureExtractionDto();
    
    // These should work without throwing errors
    dto.dangerous_permissions = 0.5;
    dto.internet_permission = 1;
    
    // Legacy fields can be undefined
    expect(dto.has_sms).toBeUndefined();
    expect(dto.is_system_app).toBeUndefined();
  });
});
