// test/vault.e2e-spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Vault Module (e2e)', () => {
  let app: INestApplication;
  let authToken: string;
  let vaultSession: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Login pour obtenir le token
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'test@test.com', password: 'Test123!' });
    
    authToken = loginResponse.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Password Analyzer', () => {
    it('/password-analyzer/analyze (POST) - weak password', () => {
      return request(app.getHttpServer())
        .post('/password-analyzer/analyze')
        .send({ password: 'password123' })
        .expect(200)
        .expect((res) => {
          expect(res.body.score).toBeLessThan(50);
          expect(res.body.level).toBe('weak');
        });
    });

    it('/password-analyzer/generate (POST)', () => {
      return request(app.getHttpServer())
        .post('/password-analyzer/generate')
        .send({ length: 16 })
        .expect(200)
        .expect((res) => {
          expect(res.body.password.length).toBe(16);
          expect(res.body.analysis.score).toBeGreaterThan(70);
        });
    });
  });

  describe('Vault Operations', () => {
    it('/vault/initialize (POST)', async () => {
      const response = await request(app.getHttpServer())
        .post('/vault/initialize')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          masterPassword: 'MasterPassword@2025!',
          deviceId: 'test-device',
        })
        .expect(201);

      vaultSession = response.body.sessionId;
      expect(vaultSession).toBeDefined();
    });

    it('/vault/passwords (POST) - create password', () => {
      return request(app.getHttpServer())
        .post('/vault/passwords')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-vault-session', vaultSession)
        .send({
          siteName: 'TestSite',
          username: 'testuser',
          password: 'TestPass123!',
        })
        .expect(201)
        .expect((res) => {
          expect(res.body.siteName).toBe('TestSite');
          expect(res.body.strengthAnalysis).toBeDefined();
        });
    });

    it('/vault/passwords (GET) - list passwords', () => {
      return request(app.getHttpServer())
        .get('/vault/passwords')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-vault-session', vaultSession)
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });

    it('/vault/lock (POST)', () => {
      return request(app.getHttpServer())
        .post('/vault/lock')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-vault-session', vaultSession)
        .expect(200);
    });

    it('/vault/passwords (GET) - should fail after lock', () => {
      return request(app.getHttpServer())
        .get('/vault/passwords')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-vault-session', vaultSession)
        .expect(401);
    });
  });
});