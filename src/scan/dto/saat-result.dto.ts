export class SAATCheckResult {
  name: string;
  passed: boolean;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  findings: string[];
  penalty: number; // points deducted from security score
}

export class SAATResultDto {
  obfuscation: SAATCheckResult;
  nativeLibraries: SAATCheckResult;
  reflection: SAATCheckResult;
  dynamicCodeLoading: SAATCheckResult;
  weakCrypto: SAATCheckResult;
  hardcodedSecrets: SAATCheckResult;
  cleartextTraffic: SAATCheckResult;
  
  totalPenalty: number;
  analysisTime: number; // ms
  completionRate: number; // 0-100%
}
