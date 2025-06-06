"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchOrError = fetchOrError;
const axios_1 = __importDefault(require("axios"));
const rpc_error_1 = require("./rpc-error");
const error_types_1 = require("./error-types");
async function fetchOrError(requestConfig) {
    try {
        const response = await (0, axios_1.default)({
            timeout: 16000,
            ...requestConfig,
        });
        return response.data;
    }
    catch (error) {
        handleAxiosError(error);
    }
}
function handleAxiosError(error) {
    if (axios_1.default.isAxiosError(error)) {
        const axiosError = error;
        if (axiosError.response) {
            handleServerResponseError(axiosError.response);
        }
        else if (axiosError.request) {
            handleNetworkError();
        }
        else {
            handleRequestSetupError(axiosError.message);
        }
    }
    else {
        handleUnknownError(error);
    }
}
function handleServerResponseError(response) {
    const { status, statusText, data: errorData } = response;
    const displayStatusText = statusText || `HTTP ${status} Error`;
    const errorMessage = `API Request Failed: ${status} - ${displayStatusText}. ${JSON.stringify(errorData) || "Something went wrong"}`;
    throw new rpc_error_1.ApiError(errorMessage, {
        status,
        statusText: displayStatusText,
        data: errorData,
        type: error_types_1.ApiErrorType.ServerResponseError,
    });
}
function handleNetworkError() {
    throw new rpc_error_1.ApiError("Network Error: No response received. Please check your internet connection or the server status.", { type: error_types_1.ApiErrorType.NetworkError });
}
function handleRequestSetupError(message) {
    throw new rpc_error_1.ApiError(`Request Setup Error: ${message}`, {
        type: error_types_1.ApiErrorType.RequestSetupError,
    });
}
function handleUnknownError(error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new rpc_error_1.ApiError(`An unexpected error occurred: ${errorMessage}`, {
        type: error_types_1.ApiErrorType.UnknownError,
    });
}
axios_1.default.interceptors.request.use(function (config) {
    console.log("Axios Request:", config);
    return config;
}, function (error) {
    console.error("Axios Request Error:", error);
    return Promise.reject(error);
});
//# sourceMappingURL=rpc-utils.js.map