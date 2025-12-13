import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ScanRepository } from '../../infrastructure/repositories/scan.repository';
import { AppRepository } from '../../infrastructure/repositories/app.repository';
import { ScanStatusResponseDto, ScanResultsSummaryDto } from '../../domain/dtos/scan-response.dto';

@Injectable()
export class GetScanStatusUseCase {
  private logger = new Logger(GetScanStatusUseCase.name);

  constructor(
    private scanRepository: ScanRepository,
    private appRepository: AppRepository,
  ) {}

  async execute(scanId: string): Promise<ScanStatusResponseDto> {
    // Récupérer le scan
    const scan = await this.scanRepository.findById(scanId);
    if (!scan) {
      this.logger.warn(`Scan not found: ${scanId}`);
      throw new NotFoundException(`Scan with ID ${scanId} not found`);
    }

    // Log the database state
    const globalScore = (scan.results as any)?.globalScore || 0;
    this.logger.log(
      `[STATUS_API] totalApps=${scan.totalApps}, scannedApps=${scan.scannedApps}, globalScore=${globalScore}`,
    );

    // Compute progress from scan data
    const totalApps = scan.totalApps || 0;
    const scannedApps = scan.scannedApps || 0;
    const progress =
      totalApps === 0
        ? 0
        : scannedApps === totalApps
          ? 100
          : Math.round((scannedApps / totalApps) * 100);

    // Build response using ONLY scan document data
    const response: ScanStatusResponseDto = {
      scanId: scan.id || scanId,
      status: scan.status as 'pending' | 'analyzing' | 'completed' | 'failed',
      progress,
      totalApps,
      scannedApps,
    };

    // If completed, include results from scan.results
    if (scan.status === 'completed' && scan.results) {
      response.results = {
        totalScanned: scan.scannedApps || 0,
        highRiskApps: 0, // Use data from results if available
        mediumRiskApps: 0, // Use data from results if available
        lowRiskApps: 0, // Use data from results if available
        averageScore: globalScore,
      };
    }

    return response;
  }
}
