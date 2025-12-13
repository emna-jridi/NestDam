import { AppEntity } from '../entities/app.entity';

export interface IAppRepository {
  findByPackageName(packageName: string): Promise<AppEntity | null>;
  findByPackageNames(packageNames: string[]): Promise<AppEntity[]>;
  findAll(): Promise<AppEntity[]>;
  save(app: AppEntity): Promise<AppEntity>;
  saveMultiple(apps: AppEntity[]): Promise<AppEntity[]>;
  update(packageName: string, app: Partial<AppEntity>): Promise<AppEntity | null>;
  delete(packageName: string): Promise<boolean>;
}

export const IAppRepository = Symbol('IAppRepository');
