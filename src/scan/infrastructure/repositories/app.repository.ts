import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppEntity } from '../../domain/entities/app.entity';
import { IAppRepository } from '../../domain/repositories/app.repository';
import { AppSchema } from '../schemas/app.schema';

@Injectable()
export class AppRepository implements IAppRepository {
  constructor(
    @InjectModel('App') private appModel: Model<AppSchema>,
  ) {}

  async findByPackageName(packageName: string): Promise<AppEntity | null> {
    const doc = await this.appModel.findOne({ packageName }).lean().exec();
    return doc ? this.mapToEntity(doc) : null;
  }

  async findByPackageNames(packageNames: string[]): Promise<AppEntity[]> {
    const docs = await this.appModel.find({ packageName: { $in: packageNames } }).lean().exec();
    return docs.map(doc => this.mapToEntity(doc));
  }

  async findAll(): Promise<AppEntity[]> {
    const docs = await this.appModel.find().lean().exec();
    return docs.map(doc => this.mapToEntity(doc));
  }

  async save(app: AppEntity): Promise<AppEntity> {
    const doc = new this.appModel(app);
    const saved = await doc.save();
    return this.mapToEntity(saved.toObject());
  }

  async saveMultiple(apps: AppEntity[]): Promise<AppEntity[]> {
    const docs = await this.appModel.insertMany(apps);
    return docs.map(doc => this.mapToEntity(doc.toObject()));
  }

  async update(packageName: string, app: Partial<AppEntity>): Promise<AppEntity | null> {
    const updated = await this.appModel
      .findOneAndUpdate({ packageName }, app, { new: true })
      .lean()
      .exec();
    return updated ? this.mapToEntity(updated) : null;
  }

  async delete(packageName: string): Promise<boolean> {
    const result = await this.appModel.deleteOne({ packageName }).exec();
    return result.deletedCount > 0;
  }

  private mapToEntity(doc: any): AppEntity {
    return {
      id: doc._id?.toString(),
      packageName: doc.packageName,
      appName: doc.appName || '',
      version: doc.version,
      platform: doc.platform,
      permissions: doc.permissions || [],
      installedDate: doc.installedDate,
      storeData: doc.storeData,
      scanResults: doc.scanResults,
      finalScore: doc.finalScore,
      lastScanned: doc.lastScanned,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}
