import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import FormData from 'form-data';
import * as fs from 'fs';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Scan } from './schemas/scan.schema';

@Injectable()
export class ScanService {
  private readonly logger = new Logger(ScanService.name);
  private readonly mobsfUrl = process.env.MOBSF_URL;
  private readonly mobsfKey = process.env.MOBSF_API_KEY;

  constructor(@InjectModel(Scan.name) private scanModel: Model<Scan>) {}

  async uploadApk(filePath: string) {
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));

    const headers = { ...form.getHeaders(), Authorization: `MobSF ${this.mobsfKey}` };
    const uploadResp = await axios.post(`${this.mobsfUrl}/api/v1/upload`, form, { headers });

    const hash = uploadResp.data.hash || uploadResp.data.file_name;
    this.logger.log(`APK uploaded with hash: ${hash}`);

    const report = await this.getReport(hash);
    const scan = new this.scanModel({
      type: 'apk',
      fileName: uploadResp.data.file_name,
      report,
    });
    await scan.save();

    return scan;
  }

  async getReport(hash: string) {
    const form = new FormData();
    form.append('hash', hash);
    const headers = { ...form.getHeaders(), Authorization: `MobSF ${this.mobsfKey}` };
    const resp = await axios.post(`${this.mobsfUrl}/api/v1/report_json`, form, { headers });
    return resp.data;
  }

  async analyzeMetadata(meta: any) {
    let score = 100;
    const alerts: string[] = [];

    if (meta.isDebuggable) {
      score -= 20;
      alerts.push('Application debuggable');
    }
    if (meta.permissions.includes('android.permission.READ_SMS')) {
      score -= 30;
      alerts.push('Access to SMS detected');
    }
    if (meta.permissions.includes('android.permission.RECORD_AUDIO')) {
      score -= 15;
      alerts.push('Microphone access detected');
    }

    const report = { alerts, finalScore: score };
    const scan = new this.scanModel({ type: 'metadata', packageName: meta.packageName, score, report });
    await scan.save();

    return scan;
  }
}
