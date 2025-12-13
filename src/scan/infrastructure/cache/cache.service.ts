import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CacheService {
  private logger = new Logger(CacheService.name);
  private cache: Map<string, { value: any; expiry: number }> = new Map();
  private defaultTTL: number = 3600000; // 1 hour in ms

  constructor(private configService: ConfigService) {
    // Clean up expired entries every 10 minutes
    setInterval(() => this.cleanup(), 10 * 60 * 1000);
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const entry = this.cache.get(key);
      if (!entry) return null;

      if (Date.now() > entry.expiry) {
        this.cache.delete(key);
        return null;
      }

      return entry.value as T;
    } catch (error: any) {
      this.logger.warn(`Cache operation failed: ${error.message}`);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttl: number = this.defaultTTL): Promise<boolean> {
    try {
      this.cache.set(key, {
        value,
        expiry: Date.now() + ttl * 1000, // Convert seconds to ms if needed
      });
      return true;
    } catch (error: any) {
      this.logger.warn(`Cache operation failed: ${error.message}`);
      return false;
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      return this.cache.delete(key);
    } catch (error: any) {
      this.logger.warn(`Cache operation failed: ${error.message}`);
      return false;
    }
  }

  async clear(): Promise<boolean> {
    try {
      this.cache.clear();
      return true;
    } catch (error: any) {
      this.logger.warn(`Cache operation failed: ${error.message}`);
      return false;
    }
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiry) {
        this.cache.delete(key);
      }
    }
  }
}
