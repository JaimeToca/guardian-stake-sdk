import axios, { AxiosRequestConfig, AxiosResponse, AxiosError } from "axios";
import { ApiError } from "./rpc-error";
import { ApiErrorType } from "./error-types";

export async function fetchOrError<T>(
  requestConfig: AxiosRequestConfig
): Promise<T> {
  try {
    const response: AxiosResponse<T> = await axios({
      timeout: 5000, // Default timeout of 5 seconds
      ...requestConfig,
    });

    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;

      if (axiosError.response) {
        // Errors outside 2xx range, i,e 400-500 etc...
        const status = axiosError.response.status;
        const statusText =
          axiosError.response.statusText || `HTTP ${status} Error`;
        const errorData = axiosError.response.data; // Server's error payload

        const errorMessage = `API Request Failed: ${status} - ${statusText}. ${
          JSON.stringify(errorData) ||
          "Something went wrong"
        }`;

        throw new ApiError(errorMessage, {
          status: status,
          statusText: statusText,
          data: errorData,
          type: ApiErrorType.ServerResponseError,
        });
      } else if (axiosError.request) {
        throw new ApiError(
          "Network Error: No response received. Please check your internet connection or the server status",
          { type: ApiErrorType.NetworkError }
        );
      } else {
        throw new ApiError(`Request Setup Error: ${axiosError.message}`, {
          type: ApiErrorType.RequestSetupError,
        });
      }
    } else {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new ApiError(`An unexpected error occurred: ${errorMessage}`, {
        type: ApiErrorType.UnknownError,
      });
    }
  }
}

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
