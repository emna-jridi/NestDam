import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import FormData from 'form-data';
import * as fs from 'fs';

@Injectable()
export class MobSFService {
  private logger = new Logger(MobSFService.name);
  private mobsfUrl: string;
  private mobsfApiKey: string;
  private httpClient: AxiosInstance;

  constructor(private configService: ConfigService) {
    this.mobsfUrl = this.configService.get<string>('MOBSF_URL', 'http://localhost:8000');
    this.mobsfApiKey = this.configService.get<string>('MOBSF_API_KEY', 'mockkeyfornow');

    this.httpClient = axios.create({
      baseURL: this.mobsfUrl,
      headers: {
        'X-Mobsf-Api-Key': this.mobsfApiKey,
      },
      timeout: 120000,
    });
  }

  async uploadApp(filePath: string): Promise<{ md5: string; scan_type: string }> {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const form = new FormData();
      form.append('file', fs.createReadStream(filePath));

      const response = await this.httpClient.post('/api/v1/upload', form, {
        headers: form.getHeaders(),
      });

      return {
        md5: response.data.hash || response.data.md5,
        scan_type: response.data.scan_type || 'apk',
      };
    } catch (error) {
      this.logger.error(`MobSF upload failed: ${error.message}`);
      throw error;
    }
  }

  async getScanReport(hash: string, scanType: string = 'apk'): Promise<{
    scan_id: string;
    certificates: any[];
    certificate_analysis: any;
    android_api: any;
    android_manifest_axml: any;
    android_manifest_xml: any;
    exported_activities: string[];
    permissions: any;
    trackers: any[];
    security_analysis: any;
  }> {
    try {
      const params = {
        hash,
        scan_type: scanType,
      };

      const response = await this.httpClient.get('/api/v1/scan_json', { params });

      return {
        scan_id: response.data.scan_id || hash,
        certificates: response.data.certificates || [],
        certificate_analysis: response.data.certificate_analysis || {},
        android_api: response.data.android_api || {},
        android_manifest_axml: response.data.android_manifest_axml || {},
        android_manifest_xml: response.data.android_manifest_xml || '',
        exported_activities: response.data.exported_activities || [],
        permissions: response.data.permissions || {},
        trackers: response.data.trackers || [],
        security_analysis: response.data.security_analysis || {},
      };
    } catch (error) {
      this.logger.warn(`MobSF report fetch failed for ${hash}: ${error.message}`);
      return {
        scan_id: hash,
        certificates: [],
        certificate_analysis: {},
        android_api: {},
        android_manifest_axml: {},
        android_manifest_xml: '',
        exported_activities: [],
        permissions: {},
        trackers: [],
        security_analysis: {},
      };
    }
  }

  async deleteReport(hash: string): Promise<boolean> {
    try {
      const params = { hash };
      const response = await this.httpClient.post('/api/v1/delete_scan', {}, { params });
      return response.status === 200;
    } catch (error) {
      this.logger.warn(`MobSF delete failed: ${error.message}`);
      return false;
    }
  }
}
