import { Injectable } from '@nestjs/common';
import { QuickScanService } from './quick/QuickScanService';
import { SmartScanService } from './smart/SmartScanService';
import { DeepScanService } from './deep/DeepScanService';
import { ScanDecisionEngine } from './core/ScanDecisionEngine';
import { ScanResult } from './core/ScanResult';
import { ScanConfiguration, ScanType } from './core/ScanTypes';

@Injectable()
export class ScanOrchestrator {
  private activeScanSessions: Map<string, ScanResult> = new Map();

  constructor(
    private quickScanService: QuickScanService,
    private smartScanService: SmartScanService,
    private deepScanService: DeepScanService,
    private scanDecisionEngine: ScanDecisionEngine,
  ) {}

  /**
   * Orchestrates a scan based on configuration and device state
   */
  async initiateScan(
    deviceId: string,
    config: ScanConfiguration,
  ): Promise<ScanResult> {
    try {
      // Determine scan type if not specified
      const scanType = config.type || ScanType.QUICK;

      // Execute appropriate scan service
      let result: ScanResult;
      switch (scanType) {
        case ScanType.QUICK:
          result = await this.quickScanService.performQuickScan(
            deviceId,
            config.targetPackages || [],
          );
          break;

        case ScanType.SMART:
          result = await this.smartScanService.performSmartScan(
            deviceId,
            config.targetPackages || [],
          );
          break;

        case ScanType.DEEP:
          result = await this.deepScanService.performDeepScan(
            deviceId,
            config.targetPackages || [],
          );
          break;

        default:
          throw new Error(`Unknown scan type: ${scanType}`);
      }

      // Store active scan session
      this.activeScanSessions.set(result.id, result);

      // Process and prioritize findings
      result.findings = this.scanDecisionEngine.prioritizeFindings(result.findings);

      return result;
    } catch (error) {
      throw new Error(`Scan orchestration failed: ${error.message}`);
    }
  }

  /**
   * Gets the current status of a scan
   */
  getScanStatus(scanId: string): ScanResult | null {
    return this.activeScanSessions.get(scanId) || null;
  }

  /**
   * Cancels an active scan
   */
  async cancelScan(scanId: string): Promise<void> {
    const scan = this.activeScanSessions.get(scanId);
    if (!scan) {
      throw new Error(`Scan not found: ${scanId}`);
    }

    // TODO: Implement service-specific cancellation
    switch (scan.scanType) {
      case ScanType.QUICK:
        await this.quickScanService.cancelScan(scanId);
        break;
      // Add other scan type cancellations as needed
    }

    this.activeScanSessions.delete(scanId);
  }

  /**
   * Resumes a previously paused scan
   */
  async resumeScan(scanId: string): Promise<ScanResult> {
    // TODO: Implement resume logic
    throw new Error('Not implemented');
  }

  /**
   * Performs a chainable scan: Quick -> Smart -> Deep based on findings
   */
  async performChainedScan(
    deviceId: string,
    packages: string[],
  ): Promise<ScanResult> {
    // TODO: Implement chained scanning logic
    // 1. Start with Quick scan
    // 2. If critical findings, run Smart scan
    // 3. If still suspicious, run Deep scan
    // 4. Merge and prioritize all findings

    return this.quickScanService.performQuickScan(deviceId, packages);
  }

  /**
   * Gets aggregated scan statistics
   */
  getAggregatedStats(): Record<string, any> {
    // TODO: Implement statistics aggregation
    return {
      totalScans: this.activeScanSessions.size,
      activeSessions: Array.from(this.activeScanSessions.values()),
    };
  }
}
