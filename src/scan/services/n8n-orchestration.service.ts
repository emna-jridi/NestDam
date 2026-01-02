import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { N8NOrchestrationFailedException } from '../utils';

@Injectable()
export class N8NOrchestrationService {
  private readonly logger = new Logger(N8NOrchestrationService.name);
  private readonly N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;
  private readonly N8N_AUTH_TOKEN = process.env.N8N_AUTH_TOKEN;
  private readonly POLLING_INTERVAL = 5000; // 5 seconds
  private readonly MAX_POLLING_TIME = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_RETRIES = 3;

  /**
   * Submit deep scan to N8N workflow
   */
  async submitDeepScan(payload: {
    scanId: string;
    packageName: string;
    apkUrl?: string;
    features: any;
    mlScore: number;
  }): Promise<any> {
    try {
      if (!this.N8N_WEBHOOK_URL) {
        this.logger.warn('N8N webhook URL not configured');
        return { status: 'SKIPPED', reason: 'N8N not configured' };
      }

      this.logger.log(`Submitting deep scan to N8N: ${payload.scanId}`);

      const result = await this.callWebhookWithRetry(payload);

      // Wait for result via polling
      const deepScanResult = await this.pollForResult(payload.scanId);

      return deepScanResult;
    } catch (error) {
      this.logger.error(`N8N submission failed: ${error.message}`);
      throw new N8NOrchestrationFailedException();
    }
  }

  /**
   * Call N8N webhook with retry logic
   */
  private async callWebhookWithRetry(payload: any, attempt: number = 1): Promise<any> {
    try {
      const url = `${this.N8N_WEBHOOK_URL}/webhook/shadowguard-deep-scan`;

      const headers: any = {
        'Content-Type': 'application/json',
        'User-Agent': 'ShadowGuard/2.0',
      };

      if (this.N8N_AUTH_TOKEN) {
        headers['Authorization'] = `Bearer ${this.N8N_AUTH_TOKEN}`;
      }

      this.logger.debug(`Calling N8N webhook (attempt ${attempt})`);

      const response = await axios.post(url, payload, {
        headers,
        timeout: 30000,
      });

      this.logger.debug(`N8N webhook responded with status ${response.status}`);

      return response.data;
    } catch (error) {
      if (attempt < this.MAX_RETRIES) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        this.logger.warn(`N8N call attempt ${attempt} failed, retrying in ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.callWebhookWithRetry(payload, attempt + 1);
      }

      throw error;
    }
  }

  /**
   * Poll for deep scan result
   */
  private async pollForResult(scanId: string): Promise<any> {
    const startTime = Date.now();

    while (Date.now() - startTime < this.MAX_POLLING_TIME) {
      try {
        // In production, you would check a database or cache for the result
        // For now, return a mock result after first poll
        await new Promise((resolve) => setTimeout(resolve, this.POLLING_INTERVAL));

        // Check for completion (mock implementation)
        const isComplete = Date.now() - startTime > this.POLLING_INTERVAL;

        if (isComplete) {
          return {
            scanId,
            status: 'COMPLETED',
            analysisDetails: {
              flaggedBehaviors: [],
              riskIndicators: [],
              malwareSignatures: [],
            },
          };
        }
      } catch (error) {
        this.logger.warn(`Polling failed: ${error.message}`);
      }
    }

    this.logger.warn(`N8N polling timeout for ${scanId}`);
    return {
      scanId,
      status: 'TIMEOUT',
      error: 'Deep scan polling exceeded 5 minute limit',
    };
  }

  /**
   * Handle N8N callback (webhook endpoint will call this)
   */
  async handleCallback(callbackData: {
    scanId: string;
    status: string;
    results: any;
  }): Promise<void> {
    try {
      this.logger.log(`Received N8N callback for scan ${callbackData.scanId}`);

      // Store callback result in database
      // This would integrate with your scan storage service

      this.logger.debug(`Processed callback for ${callbackData.scanId}`);
    } catch (error) {
      this.logger.error(`Failed to process callback: ${error.message}`);
    }
  }

  /**
   * Check N8N health
   */
  async checkHealth(): Promise<boolean> {
    try {
      if (!this.N8N_WEBHOOK_URL) {
        return false;
      }

      const response = await axios.get(`${this.N8N_WEBHOOK_URL}/api/n8n/status`, {
        timeout: 5000,
      });

      return response.status === 200;
    } catch (error) {
      this.logger.warn(`N8N health check failed: ${error.message}`);
      return false;
    }
  }
}
