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
    // 👇 YOUR API KEY
    const API_KEY = 'AIzaSyBkpXuI49UaRRyxp_1JU3vh3rn5AkmfOGA'; 

    if (API_KEY && API_KEY.startsWith('AIza')) {
      this.genAI = new GoogleGenerativeAI(API_KEY);
      this.logger.log('✨ Gemini AI Client Ready');
    } else {
      this.logger.warn('⚠️ No valid API Key found. Defaulting to Local Engine.');
    }
  }

  async generateSafetyReport(packageName: string): Promise<ReportDto> {
    // 1. Try AI Analysis (looping through models)
    if (this.genAI) {
      for (const modelName of this.MODELS_TO_TRY) {
        try {
          // this.logger.log(`🔄 Attempting AI scan with model: ${modelName}`);
          return await this.analyzeWithAI(packageName, modelName);
        } catch (error) {
          // If 404 or error, just log warning and continue loop to next model
          this.logger.warn(`❌ Model ${modelName} failed. Trying next...`);
        }
      }
      this.logger.error('⚠️ All AI models failed. Switching to Local Engine.');
    }
    
    // 2. Fallback to Local Engine (Static Logic)
    return this.analyzeLocally(packageName);
  }

  // ==========================================
  // 🧠 OPTION A: THE AI ENGINE
  // ==========================================
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

    // Cleanup: Remove any markdown wrapping or code blocks
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

  // ==========================================
  // 🛠️ OPTION B: THE STATIC LOCAL ENGINE (Backup)
  // ==========================================
  private analyzeLocally(packageName: string): ReportDto {
    this.logger.log(`🔍 Local Scanning (Fallback): ${packageName}`);
    
    const report = new ReportDto();
    report.packageName = packageName;
    report.lastUpdate = new Date().toISOString();
    
    // Clean up name: "com.facebook.katana" -> "Facebook"
    const namePart = packageName.split('.').pop() || 'Unknown App'; 
    report.appName = namePart.charAt(0).toUpperCase() + namePart.slice(1);

    // 1. Detect Category by Keywords
    if (packageName.includes('bank') || packageName.includes('wallet') || packageName.includes('pay')) {
      report.riskLevel = 'High';
      report.dataPrivacy = 'Financial App: Handles sensitive banking credentials.';
      report.recommendations = [
        'Enable Biometric Login (Fingerprint/FaceID).',
        'Never share OTPs with anyone.',
        'Check your transaction history regularly.'
      ];
    } 
    else if (packageName.includes('social') || packageName.includes('chat') || packageName.includes('gram') || packageName.includes('book')) {
      report.riskLevel = 'Medium';
      report.dataPrivacy = 'Social App: Likely collects contacts, location, and usage data.';
      report.recommendations = [
        'Review "Privacy Settings" inside the app.',
        'Limit "Location" access to "While Using".',
        'Be careful with public photo sharing.'
      ];
    }
    else if (packageName.includes('game') || packageName.includes('puzzle') || packageName.includes('io')) {
      report.riskLevel = 'Low';
      report.dataPrivacy = 'Gaming App: May display ads and track device ID.';
      report.recommendations = [
        'Disconnect from Facebook/Google if not needed.',
        'Watch out for accidental In-App Purchases.'
      ];
    }
    else {
      // Generic Fallback
      report.riskLevel = 'Low';
      report.dataPrivacy = 'General Application.';
      report.recommendations = [
        'Keep the app updated.',
        'Uninstall if you do not use it for 3 months.'
      ];
    }

    // 2. Specific Overrides for Famous Apps
    if (packageName.includes('facebook')) {
      report.appName = 'Facebook';
      report.riskLevel = 'Medium';
      report.dataPrivacy = 'Aggressive tracking across the internet.';
    }
    if (packageName.includes('tiktok')) {
      report.appName = 'TikTok';
      report.riskLevel = 'High';
      report.dataPrivacy = 'High data collection and clipboard usage.';
    }

    return report;
  }
}