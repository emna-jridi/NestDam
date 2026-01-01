import { ScanStage } from './scan-stage';

export interface ScanStep {
  id: string;
  stage: ScanStage;
  description: string;
  critical: boolean; // si fail → stop
}
