import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ReportDto } from './dto/report.dto';

@Injectable()
export class ReportService {
  private readonly logger = new Logger(ReportService.name);
  private genAI: GoogleGenerativeAI;

  // 🧠 SMART MODEL LIST: We try these one by one until one works!
  private readonly MODELS_TO_TRY = [
    'gemini-1.5-flash',
    'gemini-1.5-flash-001',
    'gemini-1.5-pro',
    'gemini-1.0-pro',
    'gemini-pro'
  ];

  constructor() {
    // 👇 PASTE YOUR NEW KEY HERE (The one you just created)
    const API_KEY = 'AIzaSyBkpXuI49UaRRyxp_1JU3vh3rn5AkmfOGA'; 

    if (API_KEY && API_KEY == 'AIzaSyBkpXuI49UaRRyxp_1JU3vh3rn5AkmfOGA') {
      this.genAI = new GoogleGenerativeAI(API_KEY);
      this.logger.log('✨ Gemini AI Client Ready');
    } else {
      this.logger.warn('⚠️ No API Key found. Using Local Engine.');
    }
  }

  async generateSafetyReport(packageName: string): Promise<ReportDto> {
    // 1. Try AI Analysis (looping through models)
    if (this.genAI) {
      for (const modelName of this.MODELS_TO_TRY) {
        try {
          return await this.analyzeWithAI(packageName, modelName);
        } catch (error) {
          // If 404 or error, just log warning and continue loop
          this.logger.warn(`❌ Model ${modelName} failed. Trying next...`);
        }
      }
      this.logger.error('⚠️ All AI models failed. Switching to Local Engine.');
    }
    
    // 2. Fallback to Local Engine if all AI attempts fail
    return this.analyzeLocally(packageName);
  }

  private async analyzeWithAI(packageName: string, modelName: string): Promise<ReportDto> {
    const model = this.genAI.getGenerativeModel({ model: modelName });

    const prompt = `
      You are a mobile security expert. Analyze the Android app package: "${packageName}".
      
      Respond with a valid JSON object (NO markdown, NO code blocks) following this exact schema:
      {
        "appName": "Common Name of App",
        "riskLevel": "High" | "Medium" | "Low",
        "dataPrivacy": "A one-sentence summary of data collection risks.",
        "recommendations": [
          "Specific security tip 1",
          "Specific security tip 2",
          "Specific security tip 3"
        ]
      }
      
      If the package is unknown, infer functionality from the name parts.
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text();

    // Cleanup: Remove any markdown wrapping
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    const data = JSON.parse(text);
    this.logger.log(`✅ Success! Analyzed ${packageName} using ${modelName}`);

    return {
      packageName,
      appName: data.appName || packageName,
      riskLevel: data.riskLevel || 'Low',
      lastUpdate: new Date().toISOString(),
      dataPrivacy: data.dataPrivacy || 'Standard data usage.',
      recommendations: data.recommendations || ['Keep app updated.'],
    };
  }

  private analyzeLocally(packageName: string): ReportDto {
    this.logger.log(`🔍 Local Scanning: ${packageName}`);
    
    const report = new ReportDto();
    report.packageName = packageName;
    report.lastUpdate = new Date().toISOString();
    report.appName = packageName.split('.').pop() || 'Unknown App'; 

    if (packageName.includes('social') || packageName.includes('facebook')) {
      report.riskLevel = 'Medium';
      report.dataPrivacy = 'Likely collects contacts and location.';
      report.recommendations = ['Check privacy settings', 'Limit background data'];
    } else if (packageName.includes('bank')) {
      report.riskLevel = 'High';
      report.dataPrivacy = 'Financial data involved.';
      report.recommendations = ['Enable Biometrics', 'Never share OTPs'];
    } else {
      report.riskLevel = 'Low';
      report.dataPrivacy = 'Standard Application.';
      report.recommendations = ['Keep app updated', 'Review permissions'];
    }
    return report;
  }
}