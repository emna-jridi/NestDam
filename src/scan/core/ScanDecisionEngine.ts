import { Injectable } from '@nestjs/common';
import { ScanType, ScanConfiguration } from './ScanTypes';
import { Finding, FindingSeverity } from './Finding';

@Injectable()
export class ScanDecisionEngine {
  /**
   * Determines the appropriate scan type based on device capabilities and user preferences
   */
  decideScanType(
    deviceCapabilities: Record<string, any>,
    userPreferences?: Record<string, any>,
  ): ScanType {
    // TODO: Implement logic to decide scan type
    return ScanType.QUICK;
  }

  /**
   * Evaluates findings and determines recommended actions
   */
  evaluateFindings(findings: Finding[]): Record<string, any> {
    // TODO: Implement finding evaluation logic
    return {};
  }

  /**
   * Determines if a scan should be triggered automatically
   */
  shouldTriggerAutoScan(
    lastScanTime: Date,
    deviceState: Record<string, any>,
  ): boolean {
    // TODO: Implement auto-scan logic
    return false;
  }

  /**
   * Prioritizes findings based on severity and impact
   */
  prioritizeFindings(findings: Finding[]): Finding[] {
    return findings.sort((a, b) => {
      const severityOrder = {
        [FindingSeverity.CRITICAL]: 5,
        [FindingSeverity.HIGH]: 4,
        [FindingSeverity.MEDIUM]: 3,
        [FindingSeverity.LOW]: 2,
        [FindingSeverity.INFO]: 1,
      };
      return (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
    });
  }
}
