/**
 * Database Migration: Backfill analysisType for existing scans
 * 
 * This script adds the analysisType field to existing Scan documents
 * that were created before the SMART/DEEP refactor.
 * 
 * Logic:
 * - If scan has apkFile or apkUrl -> APK_UPLOAD
 * - Otherwise -> INSTALLED_APP
 * 
 * Usage:
 *   ts-node src/scan/migrations/backfill-analysis-type.ts
 */

import { MongoClient } from 'mongodb';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/shadowguard';

async function backfillAnalysisType() {
  console.log('🔧 Starting backfill: analysisType field for existing scans');
  
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db();
    const scansCollection = db.collection('scans');
    const cacheCollection = db.collection('scancaches');
    
    // Count scans without analysisType
    const missingCount = await scansCollection.countDocuments({
      analysisType: { $exists: false }
    });
    
    console.log(`📊 Found ${missingCount} scans without analysisType`);
    
    if (missingCount === 0) {
      console.log('✅ All scans already have analysisType - nothing to do!');
      return;
    }
    
    // Backfill APK_UPLOAD for scans with apkFile or apkUrl
    console.log('📝 Setting analysisType=apk_upload for APK scans...');
    const apkResult = await scansCollection.updateMany(
      {
        analysisType: { $exists: false },
        $or: [
          { apkFilePath: { $exists: true, $ne: null } },
          { apkUrl: { $exists: true, $ne: null } }
        ]
      },
      {
        $set: { analysisType: 'apk_upload' }
      }
    );
    console.log(`✅ Updated ${apkResult.modifiedCount} APK scans`);
    
    // Backfill INSTALLED_APP for remaining scans
    console.log('📝 Setting analysisType=installed_app for installed app scans...');
    const installedResult = await scansCollection.updateMany(
      {
        analysisType: { $exists: false }
      },
      {
        $set: { analysisType: 'installed_app' }
      }
    );
    console.log(`✅ Updated ${installedResult.modifiedCount} installed app scans`);
    
    // Backfill cache collection
    console.log('📝 Backfilling cache collection...');
    const cacheApkResult = await cacheCollection.updateMany(
      {
        analysisType: { $exists: false },
        $or: [
          { 'scanResult.apkFilePath': { $exists: true } },
          { 'scanResult.apkUrl': { $exists: true } }
        ]
      },
      {
        $set: { analysisType: 'apk_upload' }
      }
    );
    console.log(`✅ Updated ${cacheApkResult.modifiedCount} APK cache entries`);
    
    const cacheInstalledResult = await cacheCollection.updateMany(
      {
        analysisType: { $exists: false }
      },
      {
        $set: { analysisType: 'installed_app' }
      }
    );
    console.log(`✅ Updated ${cacheInstalledResult.modifiedCount} installed app cache entries`);
    
    // Verify backfill
    const remainingCount = await scansCollection.countDocuments({
      analysisType: { $exists: false }
    });
    
    if (remainingCount > 0) {
      console.warn(`⚠️  ${remainingCount} scans still missing analysisType - manual review needed`);
    } else {
      console.log('✅ All scans now have analysisType field');
    }
    
    console.log('\n🎉 Backfill completed successfully!');
    
    // Show statistics
    console.log('\n📊 Statistics:');
    const apkCount = await scansCollection.countDocuments({ analysisType: 'apk_upload' });
    const installedCount = await scansCollection.countDocuments({ analysisType: 'installed_app' });
    console.log(`  - APK uploads: ${apkCount}`);
    console.log(`  - Installed apps: ${installedCount}`);
    console.log(`  - Total: ${apkCount + installedCount}`);
    
  } catch (error) {
    console.error('❌ Backfill failed:', error);
    process.exit(1);
  } finally {
    await client.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run backfill
backfillAnalysisType().catch(console.error);
