import { Injectable, Logger } from '@nestjs/common';

export interface PasswordStrengthResult {
  score: number; // 0-100
  level: 'Critical' | 'Weak' | 'Medium' | 'Strong' | 'Very Strong';
  crackTime: string;
  issues: string[];
  entropy: number;
}

/**
 * AI-powered password strength analysis service
 * Uses heuristics + optional Ollama integration
 * FAIL-SAFE: Always returns a valid result even if AI is unavailable
 */
@Injectable()
export class PasswordStrengthService {
  private readonly logger = new Logger(PasswordStrengthService.name);

  // Common weak patterns
  private readonly COMMON_PASSWORDS = new Set([
    'password', '123456', '12345678', 'qwerty', 'abc123', 'monkey',
    'letmein', 'trustno1', 'dragon', 'baseball', 'iloveyou', 'master',
    'sunshine', 'ashley', 'bailey', 'shadow', 'superman', 'password1',
  ]);

  private readonly KEYBOARD_PATTERNS = [
    'qwerty', 'asdfgh', 'zxcvbn', 'qwertyuiop', 'asdfghjkl',
    'zxcvbnm', '1qaz2wsx', 'qazwsx', '123qwe',
  ];

  private readonly SEQUENCES = [
    '123', '234', '345', '456', '567', '678', '789',
    'abc', 'bcd', 'cde', 'def', 'efg', 'fgh',
  ];

  /**
   * Analyze password strength using heuristics
   */
  async analyzePassword(
    password: string,
    userContext?: { name?: string; email?: string; dob?: string },
  ): Promise<PasswordStrengthResult> {
    const issues: string[] = [];
    let score = 100;

    // Length check
    if (password.length < 8) {
      issues.push('Password is too short (minimum 8 characters)');
      score -= 30;
    } else if (password.length < 12) {
      issues.push('Password could be longer for better security');
      score -= 15;
    }

    // Character variety
    const hasLower = /[a-z]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasDigit = /\d/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);

    const varietyCount = [hasLower, hasUpper, hasDigit, hasSpecial].filter(Boolean).length;

    if (varietyCount < 3) {
      issues.push('Use a mix of uppercase, lowercase, numbers, and symbols');
      score -= 20;
    }

    // Common password check
    if (this.COMMON_PASSWORDS.has(password.toLowerCase())) {
      issues.push('This is a very common password');
      score -= 40;
    }

    // Keyboard pattern check
    const lowerPassword = password.toLowerCase();
    for (const pattern of this.KEYBOARD_PATTERNS) {
      if (lowerPassword.includes(pattern)) {
        issues.push('Avoid keyboard patterns like "qwerty"');
        score -= 25;
        break;
      }
    }

    // Sequence check
    for (const seq of this.SEQUENCES) {
      if (lowerPassword.includes(seq)) {
        issues.push('Avoid sequential characters');
        score -= 20;
        break;
      }
    }

    // Repeated characters
    if (/(.)\1{2,}/.test(password)) {
      issues.push('Avoid repeated characters (e.g., "aaa")');
      score -= 15;
    }

    // Personal data check
    if (userContext) {
      if (userContext.name && lowerPassword.includes(userContext.name.toLowerCase())) {
        issues.push('Avoid using your name in passwords');
        score -= 25;
      }
      if (userContext.email && lowerPassword.includes(userContext.email.split('@')[0].toLowerCase())) {
        issues.push('Avoid using your email in passwords');
        score -= 25;
      }
      if (userContext.dob && password.includes(userContext.dob.replace(/\D/g, ''))) {
        issues.push('Avoid using your birth date');
        score -= 25;
      }
    }

    // Dictionary word check (simple)
    const words = ['love', 'hello', 'world', 'admin', 'user', 'welcome', 'master'];
    for (const word of words) {
      if (lowerPassword.includes(word)) {
        issues.push('Avoid common dictionary words');
        score -= 15;
        break;
      }
    }

    // Calculate entropy
    const entropy = this.calculateEntropy(password);

    // Clamp score
    score = Math.max(0, Math.min(100, score));

    // Determine level
    let level: PasswordStrengthResult['level'];
    if (score < 20) level = 'Critical';
    else if (score < 40) level = 'Weak';
    else if (score < 60) level = 'Medium';
    else if (score < 80) level = 'Strong';
    else level = 'Very Strong';

    // Estimate crack time
    const crackTime = this.estimateCrackTime(password, entropy);

    return {
      score,
      level,
      crackTime,
      issues: issues.length > 0 ? issues : ['No issues detected'],
      entropy,
    };
  }

  /**
   * Calculate password entropy (bits)
   */
  private calculateEntropy(password: string): number {
    let charsetSize = 0;
    
    if (/[a-z]/.test(password)) charsetSize += 26;
    if (/[A-Z]/.test(password)) charsetSize += 26;
    if (/\d/.test(password)) charsetSize += 10;
    if (/[^A-Za-z0-9]/.test(password)) charsetSize += 32;

    return Math.log2(Math.pow(charsetSize, password.length));
  }

  /**
   * Estimate time to crack password via brute force
   */
  private estimateCrackTime(password: string, entropy: number): string {
    // Assume 1 billion attempts per second (modern GPU)
    const attemptsPerSecond = 1_000_000_000;
    const possibleCombinations = Math.pow(2, entropy);
    const secondsToCrack = possibleCombinations / (2 * attemptsPerSecond); // Average is half

    if (secondsToCrack < 1) return 'Instantly';
    if (secondsToCrack < 60) return `${Math.ceil(secondsToCrack)} seconds`;
    if (secondsToCrack < 3600) return `${Math.ceil(secondsToCrack / 60)} minutes`;
    if (secondsToCrack < 86400) return `${Math.ceil(secondsToCrack / 3600)} hours`;
    if (secondsToCrack < 31536000) return `${Math.ceil(secondsToCrack / 86400)} days`;
    if (secondsToCrack < 3153600000) return `${Math.ceil(secondsToCrack / 31536000)} years`;
    return 'Centuries';
  }

  /**
   * Generate AI recommendations (fail-safe heuristic fallback)
   */
  async generateRecommendations(
    password: string,
    analysis: PasswordStrengthResult,
  ): Promise<string[]> {
    const recommendations: string[] = [];

    if (password.length < 12) {
      recommendations.push('Increase password length to at least 12 characters');
    }

    if (!/[A-Z]/.test(password)) {
      recommendations.push('Add uppercase letters for complexity');
    }

    if (!/\d/.test(password)) {
      recommendations.push('Include numbers to strengthen your password');
    }

    if (!/[^A-Za-z0-9]/.test(password)) {
      recommendations.push('Use special characters like !@#$%^&*');
    }

    if (analysis.score < 60) {
      recommendations.push('Consider using a passphrase: 4-6 random words separated by dashes');
      recommendations.push('Example: crystal-thunder-phoenix-ocean-87');
    }

    if (recommendations.length === 0) {
      recommendations.push('Your password is strong! Consider enabling 2FA for extra security.');
    }

    return recommendations;
  }

  /**
   * Optional: Integrate with Ollama for AI-powered analysis
   * This is OPTIONAL and will gracefully fallback to heuristics
   */
  async analyzeWithAI(password: string): Promise<string[]> {
    try {
      // TODO: Integrate Ollama API here
      // For now, return heuristic recommendations
      this.logger.log('AI analysis not yet implemented, using heuristics');
      return [];
    } catch (error) {
      this.logger.warn('AI analysis failed, using fallback', error);
      return [];
    }
  }
}
