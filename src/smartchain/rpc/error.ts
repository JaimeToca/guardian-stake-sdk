import { ApiErrorDetails, ApiErrorType } from "./error-types";

export class ApiError extends Error {
  public status?: number;
  public statusText?: string;
  public data?: any;
  public type: ApiErrorType;

  /**
   * @param message - The error message.
   * @param details - Additional details about the error.
   */
  constructor(message: string, details: Partial<ApiErrorDetails> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = details.status;
    this.statusText = details.statusText;
    this.data = details.data;
    this.type = details.type || ApiErrorType.UnknownError;
  }
}
