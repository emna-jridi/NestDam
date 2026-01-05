/**
 * Database Migration: Add indexes for analysisType and level fields
 * 
 * Run this script to optimize queries on the new scan model fields.
 * 
 * Usage:
 *   ts-node src/scan/migrations/add-analysis-type-index.ts
 */

import { MongoClient } from 'mongodb';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/shadowguard';

async function migrate() {
  console.log('🔧 Starting database migration: Add analysisType indexes');
  
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db();
    const scansCollection = db.collection('scans');
    const cacheCollection = db.collection('scancaches');
    
    // Add compound index on scans collection for efficient cache lookups
    console.log('📊 Creating compound index on scans collection...');
    await scansCollection.createIndex(
      { packageName: 1, versionCode: 1, level: 1, analysisType: 1 },
      { name: 'scan_lookup_idx', background: true }
    );
    console.log('✅ Created scan_lookup_idx');
    
    // Add index on analysisType for filtering
    console.log('📊 Creating index on analysisType...');
    await scansCollection.createIndex(
      { analysisType: 1 },
      { name: 'analysis_type_idx', background: true }
    );
    console.log('✅ Created analysis_type_idx');
    
    // Add compound index on cache collection
    console.log('📊 Creating compound index on cache collection...');
    await cacheCollection.createIndex(
      { packageName: 1, versionCode: 1, level: 1, analysisType: 1 },
      { name: 'cache_lookup_idx', background: true }
    );
    console.log('✅ Created cache_lookup_idx');
    
    // Add index on cache expiration
    console.log('📊 Creating TTL index on cache expiresAt...');
    await cacheCollection.createIndex(
      { expiresAt: 1 },
      { name: 'cache_ttl_idx', expireAfterSeconds: 0 }
    );
    console.log('✅ Created cache_ttl_idx (TTL index)');
    
    console.log('🎉 Migration completed successfully!');
    
    // List all indexes for verification
    console.log('\n📋 Current indexes on scans collection:');
    const scanIndexes = await scansCollection.indexes();
    scanIndexes.forEach(idx => console.log(`  - ${idx.name}:`, idx.key));
    
    console.log('\n📋 Current indexes on scancaches collection:');
    const cacheIndexes = await cacheCollection.indexes();
    cacheIndexes.forEach(idx => console.log(`  - ${idx.name}:`, idx.key));
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await client.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run migration
migrate().catch(console.error);
