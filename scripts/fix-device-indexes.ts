/**
 * Migration script to fix old indexes in the devices collection
 * This script removes the old 'user.email' index that was causing duplicate key errors
 *
 * Run with: npx ts-node scripts/fix-device-indexes.ts
 */

import * as mongoose from 'mongoose';
import * as dotenv from 'dotenv';

dotenv.config();

async function fixDeviceIndexes() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI environment variable is not set');
    process.exit(1);
  }

  try {
    // Connect to MongoDB
    await mongoose.connect(uri);
    console.log('Connected to MongoDB');

    // Wait a moment for connection to fully initialize
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Get the connection - it should be available after connect()
    const connection = mongoose.connection;
    if (!connection) {
      throw new Error('Mongoose connection object is not available');
    }

    // Access the database - try multiple approaches
    let db = connection.db;

    // If db is not available, try getting it from the client
    if (!db) {
      try {
        const client = connection.getClient();
        if (client) {
          // Extract database name from URI
          const dbName = uri.split('/').pop()?.split('?')[0] || 'shadowdb';
          db = client.db(dbName);
          console.log(`Using database: ${dbName}`);
        }
      } catch (clientError) {
        console.warn('Could not get client:', clientError);
      }
    }

    if (!db) {
      throw new Error(
        'Database connection not available. Please check your MongoDB connection and URI format.',
      );
    }

    const devicesCollection = db.collection('devices');

    // List all indexes
    const indexes = await devicesCollection.indexes();
    console.log('Current indexes on devices collection:');
    indexes.forEach((index) => {
      console.log(`  - ${index.name}:`, JSON.stringify(index.key));
    });

    // Drop the problematic 'user.email' index if it exists
    try {
      const indexToDrop = 'user.email_1';
      await devicesCollection.dropIndex(indexToDrop);
      console.log(`✅ Successfully dropped index: ${indexToDrop}`);
    } catch (error: unknown) {
      const err = error as { codeName?: string; message?: string };
      if (err.codeName === 'IndexNotFound') {
        console.log(
          'ℹ️  Index user.email_1 does not exist (already cleaned up)',
        );
      } else {
        console.error('❌ Error dropping index:', err.message || String(error));
      }
    }

    // Ensure the new deviceIdentifier index exists
    try {
      await devicesCollection.createIndex(
        { deviceIdentifier: 1 },
        { unique: true, name: 'deviceIdentifier_1' },
      );
      console.log('✅ Created/verified deviceIdentifier unique index');
    } catch (error: unknown) {
      const err = error as { code?: number; message?: string };
      if (err.code === 85) {
        console.log(
          'ℹ️  deviceIdentifier index already exists with different options',
        );
        // Try to drop and recreate
        try {
          await devicesCollection.dropIndex('deviceIdentifier_1');
          await devicesCollection.createIndex(
            { deviceIdentifier: 1 },
            { unique: true, name: 'deviceIdentifier_1' },
          );
          console.log(
            '✅ Recreated deviceIdentifier index with correct options',
          );
        } catch (recreateError: unknown) {
          const recreateErr = recreateError as { message?: string };
          console.error(
            '❌ Error recreating index:',
            recreateErr.message || String(recreateError),
          );
        }
      } else {
        console.error('❌ Error creating index:', err.message || String(error));
      }
    }

    // List indexes after cleanup
    const finalIndexes = await devicesCollection.indexes();
    console.log('\nFinal indexes on devices collection:');
    finalIndexes.forEach((index) => {
      console.log(`  - ${index.name}:`, JSON.stringify(index.key));
    });

    console.log('\n✅ Migration completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('Disconnected from MongoDB');
  }
}

void fixDeviceIndexes();
