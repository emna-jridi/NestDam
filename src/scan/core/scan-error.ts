export class ScanError extends Error {
  constructor(
    message: string,
    public readonly stepId: string,
    public readonly critical: boolean,
  ) {
    super(message);
  }
}
