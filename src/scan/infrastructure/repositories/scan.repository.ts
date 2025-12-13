import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ScanEntity } from '../../domain/entities/scan.entity';
import { IScanRepository } from '../../domain/repositories/scan.repository';
import { ScanSchema } from '../schemas/scan.schema';

@Injectable()
export class ScanRepository implements IScanRepository {
  constructor(
    @InjectModel('Scan') private scanModel: Model<ScanSchema>,
  ) {}

  async findById(id: string): Promise<ScanEntity | null> {
    const doc = await this.scanModel.findById(id).lean().exec();
    return doc ? this.mapToEntity(doc) : null;
  }

  async findByPackageName(packageName: string): Promise<ScanEntity[]> {
    const docs = await this.scanModel.find({ packageName }).lean().exec();
    return docs.map(doc => this.mapToEntity(doc));
  }

  async findByAppId(appId: string): Promise<ScanEntity[]> {
    const docs = await this.scanModel.find({ appId }).lean().exec();
    return docs.map(doc => this.mapToEntity(doc));
  }

  async findAll(): Promise<ScanEntity[]> {
    const docs = await this.scanModel.find().lean().exec();
    return docs.map(doc => this.mapToEntity(doc));
  }

  async save(scan: ScanEntity): Promise<ScanEntity> {
    // If an id is provided, use it as _id, otherwise let MongoDB generate one
    const docData = scan.id 
      ? { ...scan, _id: scan.id } 
      : scan;
    const doc = new this.scanModel(docData);
    const saved = await doc.save();
    return this.mapToEntity(saved.toObject());
  }

  async update(id: string, scan: Partial<ScanEntity>): Promise<ScanEntity | null> {
    const updated = await this.scanModel
      .findByIdAndUpdate(id, scan, { new: true })
      .lean()
      .exec();
    return updated ? this.mapToEntity(updated) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.scanModel.deleteOne({ _id: id }).exec();
    return result.deletedCount > 0;
  }

  async findLatestByPackageName(packageName: string): Promise<ScanEntity | null> {
    const doc = await this.scanModel
      .findOne({ packageName })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    return doc ? this.mapToEntity(doc) : null;
  }

  private mapToEntity(doc: any): ScanEntity {
    return {
      id: doc._id?.toString(),
      userId: doc.userId || '',
      deviceId: doc.deviceId || '',
      platform: doc.platform || 'android',
      status: doc.status,
      apps: doc.apps || [],
      results: doc.results,
      createdAt: doc.createdAt,
      completedAt: doc.completedAt,
      duration: doc.duration,
      errorMessage: doc.errorMessage,
      totalApps: doc.totalApps || 0,
      scannedApps: doc.scannedApps || 0,
    };
  }
}
