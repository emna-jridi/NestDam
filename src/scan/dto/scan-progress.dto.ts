export class ScanProgressDto {
  scanId: string;
  percentage: number; // 0-100
  currentStep: string;
  steps: {
    name: string;
    status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
    progress: number; // 0-100
    startTime?: Date;
    endTime?: Date;
    duration?: number; // ms
  }[];
  estimatedTimeRemaining?: number; // seconds
  elapsed: number; // seconds
}
