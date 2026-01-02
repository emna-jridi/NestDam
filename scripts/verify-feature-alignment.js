#!/usr/bin/env node
/**
 * Feature Alignment Verification Script
 * Tests that backend ML features match training model
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Feature Alignment Verification\n');

// Load model metadata
const metadataPath = path.resolve(__dirname, '../models/model_metadata.json');
if (!fs.existsSync(metadataPath)) {
  console.error('❌ model_metadata.json not found!');
  process.exit(1);
}

const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
console.log('✅ Loaded model metadata');
console.log(`   Version: ${metadata.version}`);
console.log(`   Created: ${metadata.created_at}`);
console.log(`   Accuracy: ${(metadata.metrics.accuracy * 100).toFixed(2)}%`);
console.log(`   AUC: ${metadata.metrics.auc.toFixed(4)}\n`);

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

// Verify feature alignment
console.log('📋 Feature Verification:\n');
let allMatch = true;

for (let i = 0; i < expectedFeatures.length; i++) {
  const expected = expectedFeatures[i];
  const actual = metadata.features[i];
  const match = expected === actual;
  
  const status = match ? '✅' : '❌';
  console.log(`   ${status} Position ${i}: ${expected}${match ? '' : ` (got: ${actual})`}`);
  
  if (!match) allMatch = false;
}

console.log('\n📊 Summary:\n');
console.log(`   Total Features: ${metadata.num_features}`);
console.log(`   Expected: ${expectedFeatures.length}`);
console.log(`   Match: ${allMatch ? '✅ YES' : '❌ NO'}\n`);

// Verify scaler parameters
console.log('🔢 StandardScaler Parameters:\n');
console.log(`   Mean length: ${metadata.scaler.mean.length}`);
console.log(`   Scale length: ${metadata.scaler.scale.length}`);
console.log(`   Sample mean[0]: ${metadata.scaler.mean[0].toFixed(6)}`);
console.log(`   Sample scale[0]: ${metadata.scaler.scale[0].toFixed(6)}\n`);

// Final verdict
if (allMatch && metadata.num_features === 12) {
  console.log('✅ VERIFICATION PASSED - Features are correctly aligned!\n');
  process.exit(0);
} else {
  console.log('❌ VERIFICATION FAILED - Feature mismatch detected!\n');
  process.exit(1);
}
