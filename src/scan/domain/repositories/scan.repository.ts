import { ScanEntity } from '../entities/scan.entity';

export interface IScanRepository {
  findById(id: string): Promise<ScanEntity | null>;
  findByPackageName(packageName: string): Promise<ScanEntity[]>;
  findByAppId(appId: string): Promise<ScanEntity[]>;
  findAll(): Promise<ScanEntity[]>;
  save(scan: ScanEntity): Promise<ScanEntity>;
  update(id: string, scan: Partial<ScanEntity>): Promise<ScanEntity | null>;
  delete(id: string): Promise<boolean>;
  findLatestByPackageName(packageName: string): Promise<ScanEntity | null>;
}

export const IScanRepository = Symbol('IScanRepository');
