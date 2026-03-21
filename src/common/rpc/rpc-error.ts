import { ApiErrorDetails, ApiErrorType } from "../../common/rpc/error-types";

/**
 * Custom error class for representing API-related errors.
 * Extends the built-in `Error` class to include additional properties relevant to API responses.
 */
export class ApiError extends Error {
  /**
   * The HTTP status code of the API response, if available.
   * For example, 404 for Not Found, 500 for Internal Server Error.
   */
  public status?: number;

  /**
   * The HTTP status text of the API response, if available.
   * For example, "Not Found", "Internal Server Error".
   */
  public statusText?: string;

  /**
   * The data returned in the API response body, if any.
   * This could be an error message, validation errors, or other relevant information from the server.
   */
  public data?: unknown;

  /**
   * The type of API error, categorized by the `ApiErrorType` enum.
   * This helps in distinguishing between different causes of API errors (e.g., network issue, server error).
   */
  public type: ApiErrorType;

  /**
   * @param message - The error message.
   * @param details - Additional details about the error.
   */
  constructor(message: string, details: Partial<ApiErrorDetails> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = details.status;
    this.statusText = details.statusText;
    this.data = details.data;
    this.type = details.type || ApiErrorType.UnknownError;
  }
}
