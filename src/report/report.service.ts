import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ReportDto } from './dto/report.dto';

@Injectable()
export class ReportService {
  private readonly logger = new Logger(ReportService.name);
  private genAI: GoogleGenerativeAI;
  private readonly modelName: string;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    const model = this.configService.get<string>('GEMINI_MODEL_NAME');

    if (apiKey && apiKey.startsWith('AIza')) {
      this.genAI = new GoogleGenerativeAI(apiKey);
      this.modelName = model || 'gemini-2.5-flash';
      this.logger.log(`✨ Gemini AI Client Ready with model: ${this.modelName}`);
    } else {
      this.logger.warn('⚠️ No valid API Key found. Defaulting to Local Engine.');
      this.modelName = '';
    }
  }

  async generateSafetyReport(packageName: string): Promise<ReportDto> {
    // Try AI Analysis if configured
    if (this.genAI && this.modelName) {
      try {
        return await this.analyzeWithAI(packageName);
      } catch (error) {
        this.logger.error(`❌ AI analysis failed: ${error.message}. Switching to Local Engine.`);
      }
    }
    
    // Fallback to Local Engine (Static Logic)
    return this.analyzeLocally(packageName);
  }

  // ==========================================
  // 🧠 OPTION A: THE AI ENGINE
  // ==========================================
  private async analyzeWithAI(packageName: string): Promise<ReportDto> {
    const model = this.genAI.getGenerativeModel({ model: this.modelName });

    const prompt = `Analyze Android app "${packageName}" as security expert. Respond ONLY with valid JSON (no markdown):
{"appName":"App Name","riskLevel":"High|Medium|Low","dataPrivacy":"One sentence risk summary","recommendations":["Tip 1","Tip 2","Tip 3"]}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text();

    // Cleanup: Remove any markdown wrapping or code blocks
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    const data = JSON.parse(text);
    this.logger.log(`✅ Success! Analyzed ${packageName} using ${this.modelName}`);

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