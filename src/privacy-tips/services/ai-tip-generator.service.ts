import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

interface TipData {
  title: string;
  content: string;
  category: string;
  priority: string;
  recommendation?: string;
  basedOn?: string;
}

interface UserDataSummary {
  userId?: string;
  email?: string;
  privacyScore?: number;
  totalScans?: number;
  riskyApps?: number;
  highRiskApps?: number;
  totalApps?: number;
  deviceCount?: number;
  topRiskyApps?: Array<{
    name: string;
    packageName: string;
    privacyScore: number;
    permissions: string[];
    trackers: number;
  }>;
  permissionStats?: Record<string, number>;
  appData?: {
    riskyApps?: number;
    recentAlerts?: number;
    totalApps?: number;
  };
  scanData?: {
    totalScans?: number;
    lastScanDate?: string | null;
    averageRiskScore?: number;
  };
  [key: string]: unknown;
}

interface AIGenerationResult {
  tips: TipData[];
  generationId: string;
  generationTimestamp: string;
  prompt: string;
  tokensUsed: number;
}

@Injectable()
export class AITipGeneratorService {
  private readonly logger = new Logger(AITipGeneratorService.name);
  private genAI: GoogleGenerativeAI | null = null;
  private readonly enabled: boolean;
  public readonly modelName: string;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    // Default to gemini-pro (most widely supported) or allow override via env var
    // Alternative models: gemini-1.5-pro, gemini-1.0-pro
    this.modelName =
      this.configService.get<string>('GEMINI_MODEL_NAME') || 'gemini-pro';
    this.enabled = !!apiKey;

    if (this.enabled && apiKey) {
      try {
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.logger.log('✅ Google Gemini AI service initialized successfully');
        this.logger.log(`📌 Using model: ${this.modelName}`);
        this.logger.debug(`API Key configured: ${apiKey.substring(0, 10)}...`);
      } catch (error) {
        this.logger.error('❌ Failed to initialize Gemini AI', error);
        this.enabled = false;
      }
    } else {
      this.logger.warn(
        '⚠️  GEMINI_API_KEY not configured. AI tip generation will use fallback tips.',
      );
    }
  }

  async generatePersonalizedTips(
    userDataSummary: UserDataSummary,
  ): Promise<AIGenerationResult> {
    this.logger.debug('🤖 Generating personalized tips with AI...');
    this.logger.debug(
      `User data summary keys: ${Object.keys(userDataSummary).join(', ')}`,
    );

    const generationId = `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const generationTimestamp = new Date().toISOString();

    if (!this.enabled || !this.genAI) {
      this.logger.warn('⚠️  AI not available, using fallback tips');
      const fallbackTip = this.getFallbackTip(
        userDataSummary,
        userDataSummary.appData || {},
      );
      return {
        tips: [fallbackTip],
        generationId,
        generationTimestamp,
        prompt: 'Fallback mode - AI not available',
        tokensUsed: 0,
      };
    }

    // Try multiple model names in order of preference
    // Note: Model names may vary by region and API version
    const modelNamesToTry = [
      this.modelName,
      'models/gemini-1.5-pro',
      'models/gemini-1.5-flash',
      'models/gemini-pro',
      'gemini-1.5-pro',
      'gemini-1.5-flash',
      'gemini-1.0-pro',
      'gemini-pro',
    ].filter((name, index, arr) => arr.indexOf(name) === index); // Remove duplicates

    let lastError: Error | null = null;

    for (const modelNameToTry of modelNamesToTry) {
      try {
        this.logger.debug(
          `📡 Trying Google Gemini API with model: ${modelNameToTry}...`,
        );
        const model = this.genAI.getGenerativeModel({ model: modelNameToTry });

        const prompt = this.createPrompt(userDataSummary);

        this.logger.debug(
          `📤 Sending prompt (${prompt.length} chars) to AI...`,
        );

        const result = await model.generateContent(prompt);
        const response = result.response;
        const responseText = response.text();

        // If we get here, the model worked!
        this.logger.log(`✅ Successfully used model: ${modelNameToTry}`);

        this.logger.debug(
          `📥 Received AI response (${responseText.length} chars)`,
        );

        // Get token usage if available
        const usageMetadata = (
          response as { usageMetadata?: { totalTokenCount?: number } }
        ).usageMetadata;
        const tokensUsed = usageMetadata?.totalTokenCount || 0;
        if (tokensUsed > 0) {
          this.logger.debug(`📊 Tokens used: ${tokensUsed}`);
        }

        // Parse JSON response (Gemini may wrap in markdown code blocks)
        let jsonText = responseText.trim();
        if (jsonText.startsWith('```json')) {
          jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        } else if (jsonText.startsWith('```')) {
          jsonText = jsonText.replace(/```\n?/g, '');
        }

        const parsed = JSON.parse(jsonText) as { tips?: TipData[] } | TipData;

        // Ensure tips is an array
        const tipsArray: TipData[] =
          'tips' in parsed && Array.isArray(parsed.tips)
            ? parsed.tips
            : [parsed as TipData];

        this.logger.log(
          `✅ AI generated ${tipsArray.length} personalized tip(s) successfully using model: ${modelNameToTry}`,
        );

        const tips: TipData[] = tipsArray.map((tip) => ({
          title: tip.title || 'Privacy Tip',
          content: tip.content || 'Stay vigilant about your privacy.',
          category: tip.category || 'general',
          priority: tip.priority || 'medium',
          recommendation: tip.recommendation,
          basedOn: tip.basedOn || 'user_data',
        }));

        return {
          tips,
          generationId,
          generationTimestamp,
          prompt,
          tokensUsed,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.warn(
          `⚠️  Model ${modelNameToTry} failed: ${lastError.message}`,
        );

        // If this is not the last model to try, continue to next
        if (modelNameToTry !== modelNamesToTry[modelNamesToTry.length - 1]) {
          continue;
        }
      }
    }

    // If we get here, all models failed
    this.logger.error('❌ All AI models failed. Last error:', lastError);
    if (lastError) {
      this.logger.error(`Error message: ${lastError.message}`);
      this.logger.error(`Error stack: ${lastError.stack}`);
    }
    this.logger.warn('⚠️  Falling back to contextual tips');

    // Try to list available models for debugging
    await this.listAvailableModels();

    this.logger.debug(
      '🔍 All models failed. Check available models at https://ai.google.dev/models',
    );
    this.logger.debug(
      '💡 TIP: Set GEMINI_MODEL_NAME environment variable with the correct model name from the list above',
    );

    const fallbackTip = this.getFallbackTip(
      userDataSummary,
      userDataSummary.appData || {},
    );
    return {
      tips: [fallbackTip],
      generationId,
      generationTimestamp,
      prompt: `All models failed. Last error: ${lastError?.message || 'Unknown error'}. Please check available models at https://ai.google.dev/models or set GEMINI_MODEL_NAME environment variable.`,
      tokensUsed: 0,
    };
  }

  private createPrompt(userDataSummary: UserDataSummary): string {
    return `You are a privacy and security expert. Analyze the following user data and generate 3-5 personalized privacy tips.

USER DATA:

${JSON.stringify(userDataSummary, null, 2)}

REQUIREMENTS:

1. Each tip must be specific to this user's actual data
2. Include specific numbers/metrics from their data (e.g., "Instagram accessed location 47 times")
3. Provide actionable recommendations
4. Prioritize high-risk issues
5. Use clear, concise language
6. Respond ONLY with valid JSON, no markdown formatting, no code blocks, no explanations before or after

FORMAT (JSON):

{
  "tips": [
    {
      "title": "Specific title mentioning user's issue",
      "content": "Detailed explanation based on their data (max 150 words)",
      "category": "permissions|data_protection|app_security|general",
      "priority": "high|medium|low",
      "recommendation": "Specific actionable advice",
      "basedOn": "What data point this tip is based on"
    }
  ]
}

IMPORTANT: Return ONLY the JSON object, nothing else.`;
  }

  private async listAvailableModels(): Promise<void> {
    if (!this.genAI) {
      return;
    }

    try {
      this.logger.debug('🔍 Attempting to list available models...');
      // The SDK might have a listModels method
      // If not available, we'll catch and continue
      const models = await (
        this.genAI as unknown as {
          listModels?: () => Promise<{ models?: Array<{ name?: string }> }>;
        }
      ).listModels?.();

      if (models?.models && models.models.length > 0) {
        this.logger.log('📋 Available models:');
        models.models.forEach((model) => {
          if (model.name) {
            // Extract just the model name (remove "models/" prefix if present)
            const modelName = model.name.replace(/^models\//, '');
            this.logger.log(`   - ${modelName} (full: ${model.name})`);
          }
        });
      } else {
        this.logger.debug(
          "Could not retrieve model list (this is expected if SDK version doesn't support it)",
        );
      }
    } catch {
      this.logger.debug(
        "Could not list models (this is expected if SDK version doesn't support it)",
      );
    }
  }

  private getFallbackTip(
    userDataSummary: UserDataSummary,
    appData: UserDataSummary['appData'],
  ): TipData {
    this.logger.debug('🔄 Generating fallback tip based on user context');
    const riskyApps = appData?.riskyApps || userDataSummary?.riskyApps || 0;
    const privacyScore = userDataSummary?.privacyScore || 0;

    // Fallback tips based on user data
    if (riskyApps > 5) {
      this.logger.debug(`Using risky apps fallback (${riskyApps} risky apps)`);
      return {
        title: 'Review Risky Apps',
        content: `You have ${riskyApps} apps with high privacy risks. Consider reviewing and removing apps that request excessive permissions or have poor privacy practices.`,
        category: 'app_security',
        priority: 'high',
        recommendation:
          'Review your installed apps and remove unnecessary ones',
        basedOn: 'risky_apps_count',
      };
    }

    if (privacyScore > 0 && privacyScore < 50) {
      return {
        title: 'Improve Your Privacy Score',
        content: `Your privacy score is ${privacyScore}/100, which is below average. Review app permissions, enable two-factor authentication, and regularly update your apps to improve your security.`,
        category: 'data_protection',
        priority: 'high',
        recommendation: 'Review and update your app permissions',
        basedOn: 'privacy_score',
      };
    }

    return {
      title: 'Stay Privacy-Aware',
      content:
        'Regularly review your app permissions and privacy settings. Keep your apps updated and be cautious about granting unnecessary permissions.',
      category: 'general',
      priority: 'medium',
      recommendation: 'Review your privacy settings monthly',
      basedOn: 'general_best_practices',
    };
  }
}
