import { ApiErrorDetails, ApiErrorType } from "./error-types";

/**
 * Custom error class for representing API-related errors.
 * Extends the built-in `Error` class to include additional properties relevant to API responses.
 */
export class ApiError extends Error {
  public status?: number;
  public statusText?: string;
  public data?: unknown;
  public type: ApiErrorType;

  constructor(message: string, details: Partial<ApiErrorDetails> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = details.status;
    this.statusText = details.statusText;
    this.data = details.data;
    this.type = details.type || ApiErrorType.UnknownError;
  }
}
