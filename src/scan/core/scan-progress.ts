export interface ScanProgress {
  currentStep: string;     // "Scanning permissions"
  completedSteps: number;
  totalSteps: number;
  percent: number;         // calculé
}
