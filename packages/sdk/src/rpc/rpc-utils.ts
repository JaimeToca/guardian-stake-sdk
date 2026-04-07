import type { AxiosRequestConfig, AxiosResponse } from "axios";
import axios from "axios";
import { ApiError } from "./rpc-error";
import { ApiErrorType } from "./error-types";

/**
 * Asynchronously fetches data using Axios and throws an error if the request fails.
 *
 * @param T The expected type of the data returned from the successful request.
 * @param {AxiosRequestConfig} requestConfig The Axios request configuration object.
 * @returns {Promise<T>} A promise that resolves with the fetched data of type T.
 * @throws {ApiError} Throws an ApiError if the request fails.
 */
export async function fetchOrError<T>(requestConfig: AxiosRequestConfig): Promise<T> {
  try {
    const response: AxiosResponse<T> = await axios({
      timeout: 16000,
      maxContentLength: 10 * 1024 * 1024, // 10 MB
      maxBodyLength: 10 * 1024 * 1024, // 10 MB
      ...requestConfig,
    });
    return response.data;
  } catch (error: unknown) {
    handleAxiosError(error);
  }
}

function handleAxiosError(error: unknown): never {
  if (axios.isAxiosError(error)) {
    if (error.response) {
      handleServerResponseError(error.response);
    } else if (error.request) {
      handleNetworkError();
    } else {
      handleRequestSetupError(error.message);
    }
  }
  handleUnknownError(error);
}

function handleServerResponseError(response: AxiosResponse): never {
  const { status, statusText, data: errorData } = response;
  const displayStatusText = statusText || `HTTP ${status} Error`;

  throw new ApiError(`API Request Failed: ${status} - ${displayStatusText}`, {
    status,
    statusText: displayStatusText,
    data: errorData,
    type: ApiErrorType.ServerResponseError,
  });
}

function handleNetworkError(): never {
  throw new ApiError(
    "Network Error: No response received. Please check your internet connection or the server status.",
    { type: ApiErrorType.NetworkError }
  );
}

function handleRequestSetupError(_message: string): never {
  throw new ApiError("Request Setup Error: failed to send the request", {
    type: ApiErrorType.RequestSetupError,
  });
}

function handleUnknownError(error: unknown): never {
  const errorMessage = error instanceof Error ? error.message : String(error);
  throw new ApiError(`An unexpected error occurred: ${errorMessage}`, {
    type: ApiErrorType.UnknownError,
  });
}
