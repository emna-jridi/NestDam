import { ScanType } from './ScanTypes';
import { ScanAggregator } from './scan-aggregator';
import { ScanResult } from './scan-result';

export class ScanExecutor {
  constructor(
    private readonly mlScanner: any,
    private readonly trackerScanner: any,
    private readonly saatClient: any,
    private readonly aggregator: ScanAggregator,
  ) {}

  async execute(
    app: { packageName: string; apkPath?: string },
    scanType: ScanType,
  ): Promise<ScanResult> {

    // 1️⃣ ML scan (TOUJOURS)
    const mlResult = await this.mlScanner.scan(app.packageName);

    // 2️⃣ Tracker scan (SMART + DEEP)
    let trackerResult = null;
    if (scanType !== ScanType.QUICK) {
      trackerResult = await this.trackerScanner.scan(app.packageName);
    }

    // 3️⃣ SAAT scan (DEEP uniquement)
    let saatResult = null;
    if (scanType === ScanType.DEEP && app.apkPath) {
      saatResult = await this.saatClient.analyze(app.apkPath);
    }

    // 4️⃣ Aggregation finale
    const result = this.aggregator as any;
    return result.aggregate ? result.aggregate({
      mlResult,
      trackerResult,
      saatResult,
    }) : ({
      mlResult,
      trackerResult,
      saatResult,
    } as unknown as ScanResult);
  }
}
