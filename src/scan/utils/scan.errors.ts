import { BadRequestException, InternalServerErrorException, GatewayTimeoutException } from '@nestjs/common';
import { SCAN_ERRORS, SCAN_ERROR_CODES } from './scan.constants';

export class ScanException extends Error {
  constructor(public code: string, message?: string) {
    super(message || SCAN_ERRORS[code] || 'Unknown error');
  }
}

export class InvalidApkFormatException extends BadRequestException {
  constructor() {
    super({
      error: SCAN_ERROR_CODES.INVALID_FILE_FORMAT,
      message: SCAN_ERRORS.SCAN_001,
    });
  }
}

export class FileTooLargeException extends BadRequestException {
  constructor() {
    super({
      error: SCAN_ERROR_CODES.FILE_TOO_LARGE,
      message: SCAN_ERRORS.SCAN_002,
    });
  }
}

export class InvalidSignatureException extends BadRequestException {
  constructor() {
    super({
      error: SCAN_ERROR_CODES.INVALID_SIGNATURE,
      message: SCAN_ERRORS.SCAN_003,
    });
  }
}

export class ManifestExtractionFailedException extends BadRequestException {
  constructor() {
    super({
      error: SCAN_ERROR_CODES.MANIFEST_EXTRACTION_FAILED,
      message: SCAN_ERRORS.SCAN_004,
    });
  }
}

export class CorruptApkException extends BadRequestException {
  constructor() {
    super({
      error: SCAN_ERROR_CODES.CORRUPT_APK,
      message: SCAN_ERRORS.SCAN_005,
    });
  }
}

export class MLTimeoutException extends GatewayTimeoutException {
  constructor() {
    super({
      error: SCAN_ERROR_CODES.ML_TIMEOUT,
      message: SCAN_ERRORS.SCAN_006,
    });
  }
}

export class TrackerApiErrorException extends InternalServerErrorException {
  constructor() {
    super({
      error: SCAN_ERROR_CODES.TRACKER_API_ERROR,
      message: SCAN_ERRORS.SCAN_007,
    });
  }
}

export class FeatureExtractionIncompleteException extends InternalServerErrorException {
  constructor() {
    super({
      error: SCAN_ERROR_CODES.FEATURE_EXTRACTION_INCOMPLETE,
      message: SCAN_ERRORS.SCAN_008,
    });
  }
}

export class N8NOrchestrationFailedException extends InternalServerErrorException {
  constructor() {
    super({
      error: SCAN_ERROR_CODES.N8N_ORCHESTRATION_FAILED,
      message: SCAN_ERRORS.SCAN_009,
    });
  }
}

export class ScanInternalErrorException extends InternalServerErrorException {
  constructor(detail?: string) {
    super({
      error: SCAN_ERROR_CODES.INTERNAL_ERROR,
      message: SCAN_ERRORS.SCAN_010,
      detail,
    });
  }
}
