// src/scan/core/scan-pipeline.ts

import { ScanType } from './ScanTypes';
import { ScanStage } from './scan-stage';
import { ScanStep } from './scan-step';
import { Capabilities } from './capabilities';
import { ScanCapability } from './scan-capability';

export class ScanPipeline {
  static build(scanType: ScanType): ScanStep[] {
    const steps: ScanStep[] = [];

    // Toujours
    steps.push({
      id: 'init',
      stage: ScanStage.INIT,
      description: 'Initializing scan context',
      critical: true,
    });

    if (Capabilities.has(scanType, ScanCapability.PERMISSIONS_ANALYSIS)) {
      steps.push({
        id: 'permissions',
        stage: ScanStage.PERMISSIONS,
        description: 'Analyzing application permissions',
        critical: true,
      });
    }

    if (Capabilities.has(scanType, ScanCapability.HEURISTIC_ANALYSIS)) {
      steps.push({
        id: 'heuristics',
        stage: ScanStage.HEURISTICS,
        description: 'Running heuristic analysis',
        critical: false,
      });
    }

    if (Capabilities.has(scanType, ScanCapability.TRACKER_DETECTION)) {
      steps.push({
        id: 'trackers',
        stage: ScanStage.TRACKERS,
        description: 'Detecting third-party trackers',
        critical: false,
      });
    }

    if (Capabilities.has(scanType, ScanCapability.ML_BEHAVIOR_ANALYSIS)) {
      steps.push({
        id: 'ml',
        stage: ScanStage.ML,
        description: 'Behavior analysis using ML',
        critical: false,
      });
    }

    if (Capabilities.has(scanType, ScanCapability.SAAT_ANALYSIS)) {
      steps.push({
        id: 'saat',
        stage: ScanStage.SAAT,
        description: 'Static advanced analysis (SAAT)',
        critical: false,
      });
    }

    if (Capabilities.has(scanType, ScanCapability.NETWORK_INSPECTION)) {
      steps.push({
        id: 'network',
        stage: ScanStage.NETWORK,
        description: 'Inspecting network communications',
        critical: false,
      });
    }

    steps.push({
      id: 'finalize',
      stage: ScanStage.FINALIZE,
      description: 'Aggregating results and scoring',
      critical: true,
    });

    return steps;
  }
}
