export enum ScanStatus {
  CREATED = 'created',
  QUEUED = 'queued',
  RUNNING = 'running',
  PARTIAL = 'partial',   // quick finished, more possible
  COMPLETED = 'completed',
  FAILED = 'failed',
}
