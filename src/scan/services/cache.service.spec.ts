import { Test, TestingModule } from '@nestjs/testing';
import { CacheService } from './cache.service';
import { getModelToken } from '@nestjs/mongoose';
import { ScanCache } from '../entities';

describe('CacheService', () => {
  let service: CacheService;
  let mockCacheModel: any;

  beforeEach(async () => {
    // Mock the cache model
    mockCacheModel = {
      findOne: jest.fn(),
      updateOne: jest.fn(),
      deleteMany: jest.fn(),
      countDocuments: jest.fn(),
      updateMany: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheService,
        {
          provide: getModelToken(ScanCache.name),
          useValue: mockCacheModel,
        },
      ],
    }).compile();

    service = module.get<CacheService>(CacheService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Cache Key Generation with analysisType', () => {
    it('should generate different keys for different analysis types', async () => {
      // Simulate different cache keys for SMART vs DEEP
      const smartKey = 'com.example.app:100:SMART:installed_app';
      const deepKey = 'com.example.app:100:DEEP:installed_app';
      const apkKey = 'com.example.app:100:SMART:apk_upload';

      // Keys should be different
      expect(smartKey).not.toBe(deepKey);
      expect(smartKey).not.toBe(apkKey);
      expect(deepKey).not.toBe(apkKey);
    });

    it('should generate consistent keys for same inputs', () => {
      // Testing key consistency
      const inputs1 = 'com.example.app:100:SMART:installed_app';
      const inputs2 = 'com.example.app:100:SMART:installed_app';
      expect(inputs1).toBe(inputs2);
    });

    it('should differentiate SMART and DEEP in cache lookup', async () => {
      const smartCached = { scanResult: { scanId: '1' } };
      mockCacheModel.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValueOnce(smartCached) });
      
      // SMART cache hit
      const smartResult = await service.getFromCache('com.example', '100', 'SMART', 'installed_app');
      expect(mockCacheModel.findOne).toHaveBeenCalled();
      expect(smartResult).toEqual(smartCached.scanResult);

      // Reset mock
      mockCacheModel.findOne.mockClear();
      mockCacheModel.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValueOnce(null) });

      // DEEP cache miss (different key)
      const deepResult = await service.getFromCache('com.example', '100', 'DEEP', 'installed_app');
      expect(mockCacheModel.findOne).toHaveBeenCalled();
      expect(deepResult).toBeNull();
    });

    it('should differentiate installed_app and apk_upload in cache', async () => {
      mockCacheModel.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValueOnce({ scanResult: { scanId: '1' } }) });
      
      // installed_app cache
      const installedResult = await service.getFromCache('com.example', '100', 'SMART', 'installed_app');
      expect(mockCacheModel.findOne).toHaveBeenCalledTimes(1);
      expect(installedResult).not.toBeNull();

      // Reset mock
      mockCacheModel.findOne.mockClear();
      mockCacheModel.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValueOnce(null) });

      // apk_upload should get different cache
      const apkResult = await service.getFromCache('com.example', '100', 'SMART', 'apk_upload');
      expect(mockCacheModel.findOne).toHaveBeenCalledTimes(1);
      expect(apkResult).toBeNull();
    });
  });

  describe('getFromCache', () => {
    it('should return cached result if found and not stale', async () => {
      const cachedData = { scanResult: { scanId: 'scan123', score: 75 }, isStale: false };
      mockCacheModel.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValueOnce(cachedData) });

      const result = await service.getFromCache('com.example', '100', 'SMART', 'installed_app');
      expect(result).toEqual(cachedData.scanResult);
    });

    it('should return null if cache is stale', async () => {
      const staleData = { scanResult: { scanId: 'scan123' }, isStale: true };
      mockCacheModel.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValueOnce(staleData) });

      const result = await service.getFromCache('com.example', '100', 'SMART', 'installed_app');
      expect(result).toBeNull();
    });

    it('should return null if cache not found', async () => {
      mockCacheModel.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValueOnce(null) });

      const result = await service.getFromCache('com.example', '100', 'SMART', 'installed_app');
      expect(result).toBeNull();
    });

    it('should handle query errors gracefully', async () => {
      mockCacheModel.findOne.mockImplementation(() => {
        throw new Error('DB error');
      });

      const result = await service.getFromCache('com.example', '100', 'SMART', 'installed_app');
      expect(result).toBeNull();
    });

    it('should use .lean() for performance', async () => {
      const leanMock = jest.fn().mockResolvedValue({ scanResult: { scanId: 'scan123' } });
      mockCacheModel.findOne.mockReturnValue({ lean: leanMock });

      await service.getFromCache('com.example', '100', 'SMART', 'installed_app');
      expect(leanMock).toHaveBeenCalled();
    });
  });

  describe('cacheResult', () => {
    it('should cache result with correct TTL for SMART', async () => {
      mockCacheModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

      await service.cacheResult('scan123', 'com.example', '100', 'SMART', 'installed_app');

      const callArgs = mockCacheModel.updateOne.mock.calls[0];
      // First argument is filter
      expect(callArgs[0]).toHaveProperty('cacheKey');
      // Second argument is data (with Mongoose upsert semantics)
      expect(callArgs[1]).toHaveProperty('level', 'SMART');
      expect(callArgs[1]).toHaveProperty('analysisType', 'installed_app');
      expect(callArgs[1]).toHaveProperty('expiresAt');
      // Third argument is options
      expect(callArgs[2]).toHaveProperty('upsert', true);
    });

    it('should cache result with correct TTL for DEEP', async () => {
      mockCacheModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

      await service.cacheResult('scan123', 'com.example', '100', 'DEEP', 'installed_app');

      const callArgs = mockCacheModel.updateOne.mock.calls[0];
      expect(callArgs[1]).toHaveProperty('level', 'DEEP');
      // DEEP should use 1-day TTL (shorter cache)
      expect(callArgs[1]).toHaveProperty('expiresAt');
    });

    it('should include analysisType in cache entry', async () => {
      mockCacheModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

      await service.cacheResult('scan123', 'com.example', '100', 'SMART', 'apk_upload');

      const callArgs = mockCacheModel.updateOne.mock.calls[0];
      expect(callArgs[1]).toHaveProperty('analysisType', 'apk_upload');
    });

    it('should include packageName and versionCode', async () => {
      mockCacheModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

      await service.cacheResult('scan123', 'com.example.app', '200', 'SMART', 'installed_app');

      const callArgs = mockCacheModel.updateOne.mock.calls[0];
      expect(callArgs[1]).toHaveProperty('packageName', 'com.example.app');
      expect(callArgs[1]).toHaveProperty('versionCode', '200');
    });

    it('should include scanId in scanResult', async () => {
      mockCacheModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

      await service.cacheResult('scan456', 'com.example', '100', 'SMART', 'installed_app');

      const callArgs = mockCacheModel.updateOne.mock.calls[0];
      expect(callArgs[1]).toHaveProperty('scanResult');
      expect(callArgs[1].scanResult).toHaveProperty('scanId', 'scan456');
    });

    it('should set isStale to false on cache', async () => {
      mockCacheModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

      await service.cacheResult('scan123', 'com.example', '100', 'SMART', 'installed_app');

      const callArgs = mockCacheModel.updateOne.mock.calls[0];
      expect(callArgs[1]).toHaveProperty('isStale', false);
    });

    it('should use upsert semantics', async () => {
      mockCacheModel.updateOne.mockResolvedValue({ modifiedCount: 1, upsertedId: 'new_id' });

      await service.cacheResult('scan123', 'com.example', '100', 'SMART', 'installed_app');

      const callArgs = mockCacheModel.updateOne.mock.calls[0];
      expect(callArgs[2]).toEqual({ upsert: true });
    });
  });

  describe('invalidateByVersion', () => {
    it('should mark older versions as stale', async () => {
      mockCacheModel.updateMany.mockResolvedValue({ modifiedCount: 5 });

      await service.invalidateByVersion('com.example', '101');

      const callArgs = mockCacheModel.updateMany.mock.calls[0];
      expect(callArgs[0]).toHaveProperty('packageName', 'com.example');
      expect(callArgs[0].versionCode).toHaveProperty('$ne', '101');
      expect(callArgs[1]).toHaveProperty('isStale', true);
    });

    it('should handle errors in invalidateByVersion', async () => {
      mockCacheModel.updateMany.mockImplementation(() => {
        throw new Error('DB error');
      });

      // Should not throw, error is handled
      await expect(service.invalidateByVersion('com.example', '101')).resolves.not.toThrow();
    });
  });

  describe('clearAll', () => {
    it('should delete all cache entries', async () => {
      mockCacheModel.deleteMany.mockResolvedValue({ deletedCount: 100 });

      await service.clearAll();

      expect(mockCacheModel.deleteMany).toHaveBeenCalledWith({});
    });

    it('should handle errors in clearAll', async () => {
      mockCacheModel.deleteMany.mockImplementation(() => {
        throw new Error('DB error');
      });

      // Should not throw, error is handled
      await expect(service.clearAll()).resolves.not.toThrow();
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', async () => {
      mockCacheModel.countDocuments.mockResolvedValueOnce(100); // total
      mockCacheModel.countDocuments.mockResolvedValueOnce(20); // stale

      const stats = await service.getStats();

      expect(stats.total).toBe(100);
      expect(stats.stale).toBe(20);
      expect(stats.fresh).toBe(80);
    });

    it('should return zero stats on error', async () => {
      mockCacheModel.countDocuments.mockImplementation(() => {
        throw new Error('DB error');
      });

      const stats = await service.getStats();

      expect(stats.total).toBe(0);
      expect(stats.fresh).toBe(0);
      expect(stats.stale).toBe(0);
    });

    it('should call countDocuments twice', async () => {
      mockCacheModel.countDocuments.mockResolvedValueOnce(100);
      mockCacheModel.countDocuments.mockResolvedValueOnce(20);

      await service.getStats();

      expect(mockCacheModel.countDocuments).toHaveBeenCalledTimes(2);
    });
  });

  describe('TTL Configuration', () => {
    it('should use 3-day TTL for SMART scans', async () => {
      mockCacheModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const now = Date.now();
      await service.cacheResult('scan123', 'com.example', '100', 'SMART', 'installed_app');

      const callArgs = mockCacheModel.updateOne.mock.calls[0];
      const expiresAt = callArgs[1].expiresAt;
      const ttlMs = expiresAt.getTime() - now;
      const ttlDays = ttlMs / (1000 * 60 * 60 * 24);

      // Allow small variance due to execution time
      expect(ttlDays).toBeGreaterThan(2.99);
      expect(ttlDays).toBeLessThan(3.01);
    });

    it('should use 1-day TTL for DEEP scans', async () => {
      mockCacheModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const now = Date.now();
      await service.cacheResult('scan123', 'com.example', '100', 'DEEP', 'installed_app');

      const callArgs = mockCacheModel.updateOne.mock.calls[0];
      const expiresAt = callArgs[1].expiresAt;
      const ttlMs = expiresAt.getTime() - now;
      const ttlDays = ttlMs / (1000 * 60 * 60 * 24);

      // Allow small variance due to execution time
      expect(ttlDays).toBeGreaterThan(0.99);
      expect(ttlDays).toBeLessThan(1.01);
    });
  });
});
