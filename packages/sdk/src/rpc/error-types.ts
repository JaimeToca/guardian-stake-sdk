/**
 * Defines the possible types of API errors that can occur.
 * Categorizes errors for more specific handling and reporting.
 */
export const ApiErrorType = {
  ServerResponseError: "ServerResponseError",
  NetworkError: "NetworkError",
  RequestSetupError: "RequestSetupError",
  UnexpectedError: "UnexpectedError",
  UnknownError: "UnknownError",
} as const;
export type ApiErrorType = (typeof ApiErrorType)[keyof typeof ApiErrorType];

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
