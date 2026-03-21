/**
 * Defines the possible types of API errors that can occur.
 * This enum helps categorize errors for more specific handling and reporting
 */
export enum ApiErrorType {
    ServerResponseError,
    NetworkError,
    RequestSetupError,
    UnexpectedError,
    UnknownError,
}

/**
 * Defines the structure for additional details that can be included with an ApiError.
 * These details provide more context about the nature of the error.
 */
export interface ApiErrorDetails {
  status?: number; // The HTTP status code of the response (e.g., 404, 500)
  statusText?: string; // The HTTP status message (e.g., "Not Found", "Internal Server Error").
  data?: unknown; // The error payload received from the server, if any
  type: ApiErrorType; // The categorized type of the API error.
}