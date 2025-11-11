// scripts/seed-trackers.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ExodusPrivacyService } from '../src/external-apis/exodus-privacy.service';
import { Model } from 'mongoose';
import { Tracker } from '../src/app-registry/schemas/tracker.schema';

// Define the type for Exodus tracker data
interface ExodusTracker {
  id: number;
  name: string;
  network_signature?: string;
  categories?: string[];
  description?: string;
  website?: string;
  code_signature?: string;
  creation_date?: string;
}

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);

  const exodusService = app.get(ExodusPrivacyService);
  const trackerModel = app.get<Model<Tracker>>('TrackerModel');

  console.log('📥 Fetching trackers from Exodus Privacy...');

  const trackers = await exodusService.getAllTrackers();
  const trackerArray = Object.values(trackers) as ExodusTracker[];

  console.log(`Found ${trackerArray.length} trackers`);

  for (const tracker of trackerArray) {
    await trackerModel.findOneAndUpdate(
      { name: tracker.name },
      {
        name: tracker.name,
        company: tracker.network_signature || 'Unknown',
        category: tracker.categories?.[0] || 'Unknown',
        description: tracker.description || '',
        websiteUrl: tracker.website || '',
        exodusId: tracker.id,
        privacyImpact: calculatePrivacyImpact(tracker),
      },
      { upsert: true, new: true },
    );
  }

  console.log('✅ Trackers seeded successfully!');
  await app.close();
}

function calculatePrivacyImpact(tracker: ExodusTracker): number {
  // Simple heuristique
  if (tracker.categories?.includes('Analytics')) return 5;
  if (tracker.categories?.includes('Advertisement')) return 7;
  if (tracker.categories?.includes('Location')) return 9;
  return 5;
}

bootstrap().catch((error) => {
  console.error('❌ Error seeding trackers:', error);
  process.exit(1);
});
