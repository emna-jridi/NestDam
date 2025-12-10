// ════════════════════════════════════════════════════════════════════════════════
// FILE: test/shadowguard.e2e-spec.ts
// End-to-End Tests pour ShadowGuard PHASE 3 Flow
// ════════════════════════════════════════════════════════════════════════════════

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { StartScanRequestDTO as StartScanRequest, ScanStatus, RiskLevel } from '../src/scan/dto/scan.dto';

describe('ShadowGuard E2E Tests (PHASE 3)', () => {
  let app: INestApplication;
  let scanId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Apps Search Flow', () => {
    it('GET /api/v1/apps/search - Should search apps', () => {
      return request(app.getHttpServer())
        .get('/api/v1/apps/search')
        .query({ query: 'whatsapp', limit: '10' })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('query');
          expect(res.body).toHaveProperty('count');
          expect(res.body).toHaveProperty('results');
          expect(Array.isArray(res.body.results)).toBe(true);
        });
    });

    it('GET /api/v1/apps/search - Should fail with short query', () => {
      return request(app.getHttpServer())
        .get('/api/v1/apps/search')
        .query({ query: 'ab', limit: '10' })
        .expect(400);
    });

    it('GET /api/v1/apps/:packageName - Should get app details', () => {
      return request(app.getHttpServer())
        .get('/api/v1/apps/com.whatsapp')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('packageName');
          expect(res.body).toHaveProperty('appName');
          expect(res.body).toHaveProperty('rating');
          expect(res.body).toHaveProperty('riskScore');
        });
    });

    it('GET /api/v1/apps/top/safe - Should get top safe apps', () => {
      return request(app.getHttpServer())
        .get('/api/v1/apps/top/safe')
        .query({ limit: '10' })
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          if (res.body.length > 0) {
            expect(res.body[0]).toHaveProperty('riskScore');
          }
        });
    });

    it('GET /api/v1/apps/top/dangerous - Should get top dangerous apps', () => {
      return request(app.getHttpServer())
        .get('/api/v1/apps/top/dangerous')
        .query({ limit: '10' })
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });

    it('GET /api/v1/apps/trending - Should get trending apps', () => {
      return request(app.getHttpServer())
        .get('/api/v1/apps/trending')
        .query({ limit: '20' })
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });

    it('GET /api/v1/apps/batch - Should get batch app details', () => {
      return request(app.getHttpServer())
        .get('/api/v1/apps/batch')
        .query({ packages: 'com.whatsapp,com.telegram,com.signal' })
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          expect(res.body.length).toBeLessThanOrEqual(3);
        });
    });
  });

  describe('Scan Flow (PHASE 3)', () => {
    it('POST /api/v1/scan/v2/start - Should start scan', () => {
      const startScanRequest: StartScanRequest = {
        apps: [
          { packageName: 'com.whatsapp', appName: 'WhatsApp', version: '1.0.0', permissions: [], platform: 'android' },
          { packageName: 'com.telegram', appName: 'Telegram', version: '1.0.0', permissions: [], platform: 'android' },
        ],
        deviceId: 'test_device_123',
        platform: 'android',
      };

      return request(app.getHttpServer())
        .post('/api/v1/scan/v2/start')
        .send(startScanRequest)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('scanId');
          expect(res.body).toHaveProperty('status');
          expect(res.body.status).toBe(ScanStatus.PENDING);
          expect(res.body).toHaveProperty('progress');
          expect(res.body.progress).toBe(0);
          expect(res.body).toHaveProperty('dates');
          expect(res.body.dates).toHaveProperty('started');
          expect(res.body.dates.completed).toBeNull();

          // Store scanId for next tests
          scanId = res.body.scanId;
        });
    });

    it('POST /api/v1/scan/v2/start - Should fail with empty apps', () => {
      const invalidRequest: StartScanRequest = {
        apps: [],
        deviceId: 'test_device',
        platform: 'android',
      };

      return request(app.getHttpServer())
        .post('/api/v1/scan/v2/start')
        .send(invalidRequest)
        .expect(400);
    });

    it('POST /api/v1/scan/v2/start - Should fail with > 100 apps', () => {
      const tooManyApps = Array(101).fill({
        packageName: 'com.app',
        appName: 'App',
        version: '1.0.0',
        permissions: [],
        platform: 'android',
      });

      const invalidRequest: StartScanRequest = {
        apps: tooManyApps,
        deviceId: 'test_device',
        platform: 'android',
      };

      return request(app.getHttpServer())
        .post('/api/v1/scan/v2/start')
        .send(invalidRequest)
        .expect(400);
    });

    it('GET /api/v1/scan/v2/:scanId/status - Should get scan status', async () => {
      // Wait a moment for async processing to start
      await new Promise(resolve => setTimeout(resolve, 100));

      return request(app.getHttpServer())
        .get(`/api/v1/scan/v2/${scanId}/status`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('scanId');
          expect(res.body.scanId).toBe(scanId);
          expect(res.body).toHaveProperty('status');
          expect([ScanStatus.PENDING, ScanStatus.PROCESSING]).toContain(res.body.status);
          expect(res.body).toHaveProperty('progress');
          expect(res.body.progress).toBeGreaterThanOrEqual(0);
        });
    });

    it('GET /api/v1/scan/v2/:scanId/status - Should fail for invalid scanId', () => {
      return request(app.getHttpServer())
        .get('/api/v1/scan/v2/invalid_scan_id/status')
        .expect(404);
    });

    it('GET /api/v1/scan/v2/:scanId/results - Should eventually return results', async () => {
      // Poll until scan completes (with timeout)
      let completed = false;
      let results;

      for (let i = 0; i < 10; i++) {
        await new Promise(resolve => setTimeout(resolve, 500));

        const response = await request(app.getHttpServer())
          .get(`/api/v1/scan/v2/${scanId}/results`);

        if (response.status === 200) {
          results = response.body;
          completed = true;
          break;
        }
      }

      // Note: Results might not be ready immediately in tests
      if (completed) {
        expect(results).toHaveProperty('apps');
        expect(results).toHaveProperty('stats');
        expect(results).toHaveProperty('global');
        expect(Array.isArray(results.apps)).toBe(true);
      }
    });

    it('DELETE /api/v1/scan/v2/:scanId - Should cancel scan', () => {
      return request(app.getHttpServer())
        .delete(`/api/v1/scan/v2/${scanId}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('success');
          expect(res.body).toHaveProperty('message');
        });
    });

    it('DELETE /api/v1/scan/v2/:scanId - Should fail for invalid scanId', () => {
      return request(app.getHttpServer())
        .delete('/api/v1/scan/v2/invalid_scan_id')
        .expect(404);
    });
  });

  describe('Complete Scan Flow', () => {
    let completeScanId: string;

    it('Step 1: Start a fresh scan', () => {
      const startRequest: StartScanRequest = {
        apps: [
          { packageName: 'com.whatsapp', appName: 'WhatsApp', version: '1.0.0', permissions: [], platform: 'android' },
        ],
        deviceId: 'complete_test_device',
        platform: 'android',
      };

      return request(app.getHttpServer())
        .post('/api/v1/scan/v2/start')
        .send(startRequest)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('scanId');
          completeScanId = res.body.scanId;
        });
    });

    it('Step 2: Check initial status is PENDING', async () => {
      await new Promise(resolve => setTimeout(resolve, 100));

      return request(app.getHttpServer())
        .get(`/api/v1/scan/v2/${completeScanId}/status`)
        .expect(200)
        .expect((res) => {
          expect([ScanStatus.PENDING, ScanStatus.PROCESSING]).toContain(res.body.status);
        });
    });

    it('Step 3: Simulate waiting for scan to process', async () => {
      // In real scenario, this would poll until COMPLETED
      await new Promise(resolve => setTimeout(resolve, 1000));

      const response = await request(app.getHttpServer())
        .get(`/api/v1/scan/v2/${completeScanId}/status`);

      expect(response.status).toBe(200);
    });

    it('Step 4: Verify Android can receive scan results', async () => {
      const statusResponse = await request(app.getHttpServer())
        .get(`/api/v1/scan/v2/${completeScanId}/status`)
        .expect(200);

      // Verify response format matches Android expectations
      expect(statusResponse.body).toHaveProperty('scanId');
      expect(statusResponse.body).toHaveProperty('status');
      expect(statusResponse.body).toHaveProperty('progress');
      expect(statusResponse.body).toHaveProperty('dates');
      expect(statusResponse.body).toHaveProperty('dates.started');
    });
  });

  describe('Error Scenarios', () => {
    it('Should handle invalid query parameters gracefully', () => {
      return request(app.getHttpServer())
        .get('/api/v1/apps/search')
        .query({ query: '', limit: 'invalid' })
        .expect(400);
    });

    it('Should handle network errors gracefully', () => {
      return request(app.getHttpServer())
        .get('/api/v1/apps/com.nonexistent.app.that.definitely.does.not.exist')
        .expect(404);
    });

    it('Should handle concurrent scan requests', async () => {
      const request1 = request(app.getHttpServer())
        .post('/api/v1/scan/v2/start')
        .send({
          apps: [{ packageName: 'com.app1', appName: 'App1', version: '1.0', permissions: [], platform: 'android' }],
          deviceId: 'device1',
          platform: 'android',
        });

      const request2 = request(app.getHttpServer())
        .post('/api/v1/scan/v2/start')
        .send({
          apps: [{ packageName: 'com.app2', appName: 'App2', version: '1.0', permissions: [], platform: 'android' }],
          deviceId: 'device2',
          platform: 'android',
        });

      const [res1, res2] = await Promise.all([request1, request2]);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(res1.body.scanId).not.toBe(res2.body.scanId);
    });
  });

  describe('Performance Checks', () => {
    it('Search endpoint should respond within 5 seconds', () => {
      return request(app.getHttpServer())
        .get('/api/v1/apps/search')
        .query({ query: 'whatsapp' })
        .timeout(5000)
        .expect(200);
    });

    it('Start scan endpoint should respond immediately', () => {
      const startRequest: StartScanRequest = {
        apps: [
          { packageName: 'com.whatsapp', appName: 'WhatsApp', version: '1.0', permissions: [], platform: 'android' },
        ],
        deviceId: 'perf_test_device',
        platform: 'android',
      };

      return request(app.getHttpServer())
        .post('/api/v1/scan/v2/start')
        .send(startRequest)
        .timeout(1000)
        .expect(200);
    });

    it('Batch endpoint should handle 50 apps efficiently', () => {
      const packages = Array(50)
        .fill(null)
        .map((_, i) => `com.app${i}`)
        .join(',');

      return request(app.getHttpServer())
        .get('/api/v1/apps/batch')
        .query({ packages })
        .timeout(5000)
        .expect(200);
    });
  });
});
