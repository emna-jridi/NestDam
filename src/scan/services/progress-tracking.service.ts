import { Injectable, Logger } from '@nestjs/common';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { ScanProgress } from '../entities';
import { ScanProgressDto } from '../dto';
import { SCAN_PROGRESS_STEPS, STEP_WEIGHTS } from '../utils';

@Injectable()
export class ProgressTrackingService {
  private readonly logger = new Logger(ProgressTrackingService.name);
  private stepTimings = new Map<string, number[]>();

  constructor(
    @InjectModel(ScanProgress.name) private progressModel: Model<ScanProgress>,
  ) {}

  /**
   * Initialize progress tracking
   */
  async initProgress(scanId: string, level: string, packageName: string): Promise<void> {
    try {
      const steps = SCAN_PROGRESS_STEPS
        .filter((step) => {
          // Filter steps based on scan level
          if (level === 'SMART' && step === 'cloud_processing') {
            return false;
          }
          return true;
        })
        .map((name) => ({
          name,
          status: 'PENDING',
          progress: 0,
        }));

      await this.progressModel.create({
        scanId,
        packageName,
        percentage: 0,
        currentStep: steps[0].name,
        steps,
        startTime: new Date(),
        lastUpdated: new Date(),
      });

      this.logger.debug(`Initialized progress for scan ${scanId}`);
    } catch (error) {
      this.logger.error(`Failed to init progress: ${error.message}`);
    }
  }

  /**
   * Update step to IN_PROGRESS
   */
  async updateStep(scanId: string, stepName: string, status: string = 'IN_PROGRESS'): Promise<void> {
    try {
      const progress = await this.progressModel.findOne({ scanId });
      if (!progress) return;

      const stepIndex = progress.steps.findIndex((s) => s.name === stepName);
      if (stepIndex === -1) return;

      progress.steps[stepIndex].status = status as 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
      progress.steps[stepIndex].progress = 0;
      progress.steps[stepIndex].startTime = new Date();
      progress.currentStep = stepName;

      // Calculate percentage
      let totalPercentage = 0;
      for (let i = 0; i < progress.steps.length; i++) {
        const stepProgress = progress.steps[i].status === 'COMPLETED' ? 100 : progress.steps[i].progress;
        totalPercentage += (stepProgress / 100) * (STEP_WEIGHTS[progress.steps[i].name] || 0.1) * 100;
      }

      progress.percentage = Math.round(totalPercentage);
      progress.lastUpdated = new Date();

      await progress.save();
      this.logger.debug(`Step ${stepName} started for scan ${scanId}`);
    } catch (error) {
      this.logger.error(`Failed to update step: ${error.message}`);
    }
  }

  /**
   * Complete a step
   */
  async completeStep(scanId: string, stepName: string): Promise<void> {
    try {
      const progress = await this.progressModel.findOne({ scanId });
      if (!progress) return;

      const stepIndex = progress.steps.findIndex((s) => s.name === stepName);
      if (stepIndex === -1) return;

      const startTime = progress.steps[stepIndex].startTime;
      progress.steps[stepIndex].status = 'COMPLETED';
      progress.steps[stepIndex].progress = 100;
      progress.steps[stepIndex].endTime = new Date();

      if (startTime) {
        progress.steps[stepIndex].duration = Date.now() - startTime.getTime();

        // Store timing for ETA calculation
        if (!this.stepTimings.has(stepName)) {
          this.stepTimings.set(stepName, []);
        }
        const timings = this.stepTimings.get(stepName);
        if (timings && progress.steps[stepIndex].duration) {
          timings.push(progress.steps[stepIndex].duration);
        }
      }

      // Calculate percentage
      let totalPercentage = 0;
      for (let i = 0; i < progress.steps.length; i++) {
        const stepProgress = progress.steps[i].status === 'COMPLETED' ? 100 : progress.steps[i].progress;
        totalPercentage += (stepProgress / 100) * (STEP_WEIGHTS[progress.steps[i].name] || 0.1) * 100;
      }

      progress.percentage = Math.round(totalPercentage);

      // Calculate ETA
      progress.estimatedTimeRemaining = this.calculateETA(progress.steps);

      progress.lastUpdated = new Date();

      await progress.save();
      this.logger.debug(`Step ${stepName} completed for scan ${scanId}`);
    } catch (error) {
      this.logger.error(`Failed to complete step: ${error.message}`);
    }
  }

  /**
   * Get progress for scan
   */
  async getProgress(scanId: string): Promise<ScanProgressDto> {
    try {
      const progress = await this.progressModel.findOne({ scanId }).lean();

      if (!progress) {
        throw new Error(`Progress not found for scan ${scanId}`);
      }

      const elapsed = Math.round((Date.now() - progress.startTime.getTime()) / 1000);

      return {
        scanId,
        percentage: progress.percentage,
        currentStep: progress.currentStep,
        steps: progress.steps,
        estimatedTimeRemaining: progress.estimatedTimeRemaining,
        elapsed,
      };
    } catch (error) {
      this.logger.error(`Failed to get progress: ${error.message}`);
      throw error;
    }
  }

  /**
   * Calculate ETA based on completed steps
   */
  private calculateETA(
    steps: Array<{
      name: string;
      status: string;
      progress: number;
      duration?: number;
    }>,
  ): number {
    let eta = 0;
    const avgStepTime = 5000; // Default 5s per step

    for (const step of steps) {
      if (step.status !== 'COMPLETED') {
        const timings = this.stepTimings.get(step.name);
        const avgTime = timings?.length
          ? timings.reduce((a, b) => a + b, 0) / timings.length
          : avgStepTime;

        eta += Math.ceil(avgTime / 1000);
      }
    }

    return Math.max(eta, 0);
  }
}
