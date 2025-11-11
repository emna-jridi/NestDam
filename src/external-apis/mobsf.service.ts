import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import FormData from 'form-data';
import * as fs from 'fs';

@Injectable()
export class MobsfService {
  private readonly logger = new Logger(MobsfService.name);
  private readonly mobsfUrl = process.env.MOBSF_URL;
  private readonly mobsfKey = process.env.MOBSF_API_KEY;

  async uploadApk(filePath: string) {
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));

    const headers = {
      ...form.getHeaders(),
      Authorization: `${this.mobsfKey}`,
    };

    try {
      const response = await axios.post(
        `${this.mobsfUrl}/api/v1/upload`,
        form,
        { headers },
      );
      return response.data;
    } catch (error) {
      this.logger.error('MobSF upload failed', error);
      throw error;
    }
  }

  async scanApk(hash: string) {
    const form = new FormData();
    form.append('hash', hash);

    const headers = {
      ...form.getHeaders(),
      Authorization: `${this.mobsfKey}`,
    };

    try {
      const response = await axios.post(`${this.mobsfUrl}/api/v1/scan`, form, {
        headers,
      });
      return response.data;
    } catch (error) {
      this.logger.error('MobSF scan failed', error);
      throw error;
    }
  }

  async getReport(hash: string) {
    const form = new FormData();
    form.append('hash', hash);

    const headers = {
      ...form.getHeaders(),
      Authorization: `${this.mobsfKey}`,
    };

    try {
      const response = await axios.post(
        `${this.mobsfUrl}/api/v1/report_json`,
        form,
        { headers },
      );
      return response.data;
    } catch (error) {
      this.logger.error('MobSF report fetch failed', error);
      throw error;
    }
  }
}
