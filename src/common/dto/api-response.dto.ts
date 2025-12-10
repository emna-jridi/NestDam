// Generic API response wrappers for consistent client contracts
export class ApiResponse<T> {
  success = true;
  data: T;
  message?: string;
  timestamp: Date = new Date();

  constructor(data: T, message?: string) {
    this.data = data;
    this.message = message;
  }
}

export class ApiErrorResponse {
  success = false;
  message: string;
  error?: string;
  timestamp: Date = new Date();

  constructor(message: string, error?: string) {
    this.message = message;
    this.error = error;
  }
}
