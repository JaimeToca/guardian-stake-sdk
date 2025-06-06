import axios, { AxiosRequestConfig, AxiosResponse, AxiosError } from "axios";
import { ApiError } from "./rpc-error";
import { ApiErrorType } from "./error-types";

/**
 * Asynchronously fetches data using Axios and throws an error if the request fails.
 * This function is generic and can infer the return type based on the usage.
 *
 * @template T The expected type of the data to be returned from the successful request.
 * @param {AxiosRequestConfig} requestConfig The Axios request configuration object,
 * specifying the URL, method, headers, data, etc.
 * @returns {Promise<T>} A promise that resolves with the fetched data of type T if the request is successful.
 * @throws {Error} Throws an error if the Axios request fails (e.g., network error, non-2xx status code).
 */
export async function fetchOrError<T>(
  requestConfig: AxiosRequestConfig
): Promise<T> {
  try {
    const response: AxiosResponse<T> = await axios({
      timeout: 16000,
      ...requestConfig,
    });
    return response.data;
  } catch (error: unknown) {
    handleAxiosError(error);
  }
}

/**
 * Handles various types of Axios errors and throws a structured ApiError.
 * @param error The unknown error caught from the API request.
 * @throws ApiError
 */
function handleAxiosError(error: unknown): never {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError;

    if (axiosError.response) {
      handleServerResponseError(axiosError.response);
    } else if (axiosError.request) {
      handleNetworkError();
    } else {
      handleRequestSetupError(axiosError.message);
    }
  } else {
    handleUnknownError(error);
  }
}

/**
 * Throws an ApiError for server responses outside the 2xx range.
 * @param response The Axios response containing error details.
 * @throws ApiError
 */
function handleServerResponseError(response: AxiosResponse): never {
  const { status, statusText, data: errorData } = response;
  const displayStatusText = statusText || `HTTP ${status} Error`;

  const errorMessage = `API Request Failed: ${status} - ${displayStatusText}. ${
    JSON.stringify(errorData) || "Something went wrong"
  }`;

  throw new ApiError(errorMessage, {
    status,
    statusText: displayStatusText,
    data: errorData,
    type: ApiErrorType.ServerResponseError,
  });
}

/**
 * Throws an ApiError for network-related issues (no response received).
 * @throws ApiError
 */
function handleNetworkError(): never {
  throw new ApiError(
    "Network Error: No response received. Please check your internet connection or the server status.",
    { type: ApiErrorType.NetworkError }
  );
}

/**
 * Throws an ApiError for errors during request setup.
 * @param message The error message from Axios.
 * @throws ApiError
 */
function handleRequestSetupError(message: string): never {
  throw new ApiError(`Request Setup Error: ${message}`, {
    type: ApiErrorType.RequestSetupError,
  });
}

/**
 * Throws an ApiError for unexpected non-Axios errors.
 * @param error The unknown error.
 * @throws ApiError
 */
function handleUnknownError(error: unknown): never {
  const errorMessage = error instanceof Error ? error.message : String(error);
  throw new ApiError(`An unexpected error occurred: ${errorMessage}`, {
    type: ApiErrorType.UnknownError,
  });
}

// Only for debugging purposes
axios.interceptors.request.use(
  function (config) {
    console.log("Axios Request:", config);
    return config;
  },
  function (error) {
    console.error("Axios Request Error:", error);
    return Promise.reject(error);
  }
);
