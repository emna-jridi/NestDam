import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Tracker } from './schemas/tracker.schema';

@Injectable()
export class TrackerService {
  private readonly logger = new Logger(TrackerService.name);

  constructor(
    @InjectModel(Tracker.name)
    private trackerModel: Model<Tracker>,
  ) {}


  
  async findTrackersByNames(trackerNames: string[]): Promise<Tracker[]> {
    try {
      const trackers = await this.trackerModel
        .find({ name: { $in: trackerNames } })
        .exec();

      this.logger.debug(`Found ${trackers.length}/${trackerNames.length} trackers in DB`);
      
      return trackers;
    } catch (error) {
      this.logger.error(`Failed to find trackers: ${error.message}`);
      return [];
    }
  }

  /**
   * ✅ Récupérer tous les trackers
   */
  async getAllTrackers(): Promise<Tracker[]> {
    try {
      const trackers = await this.trackerModel.find().exec();
      this.logger.log(`Retrieved ${trackers.length} trackers from DB`);
      return trackers;
    } catch (error) {
      this.logger.error(`Failed to get all trackers: ${error.message}`);
      return [];
    }
  }

  /**
   * ✅ Rechercher un tracker par ID Exodus
   */
  async findByExodusId(exodusId: number): Promise<Tracker | null> {
    try {
      return await this.trackerModel.findOne({ exodusId }).exec();
    } catch (error) {
      this.logger.error(`Failed to find tracker by exodusId: ${error.message}`);
      return null;
    }
  }

  /**
   * ✅ Rechercher trackers par catégorie
   */
  async findByCategory(category: string): Promise<Tracker[]> {
    try {
      return await this.trackerModel.find({ category }).exec();
    } catch (error) {
      this.logger.error(`Failed to find trackers by category: ${error.message}`);
      return [];
    }
  }

  /**
   * ✅ Créer/Mettre à jour un tracker
   */
  async upsertTracker(trackerData: Partial<Tracker>): Promise<Tracker> {
    try {
      const tracker = await this.trackerModel.findOneAndUpdate(
        { name: trackerData.name },
        trackerData,
        { upsert: true, new: true },
      );

      this.logger.debug(`Upserted tracker: ${trackerData.name}`);
      return tracker;
    } catch (error) {
      this.logger.error(`Failed to upsert tracker: ${error.message}`);
      throw error;
    }
  }

  /**
   * ✅ Statistiques
   */
  async getStats(): Promise<any> {
    try {
      const total = await this.trackerModel.countDocuments();
      
      const byCategory = await this.trackerModel.aggregate([
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]);

      const avgPrivacyImpact = await this.trackerModel.aggregate([
        { $group: { _id: null, avg: { $avg: '$privacyImpact' } } },
      ]);

      return {
        total,
        byCategory,
        avgPrivacyImpact: avgPrivacyImpact[0]?.avg || 0,
      };
    } catch (error) {
      this.logger.error(`Failed to get stats: ${error.message}`);
      return { total: 0, byCategory: [], avgPrivacyImpact: 0 };
    }
  }
}