"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchOrError = fetchOrError;
const axios_1 = __importDefault(require("axios"));
const error_1 = require("./error");
const error_types_1 = require("./error-types");
async function fetchOrError(requestConfig) {
    try {
        const response = await (0, axios_1.default)({
            timeout: 5000,
            ...requestConfig,
        });
        return response.data;
    }
    catch (error) {
        if (axios_1.default.isAxiosError(error)) {
            const axiosError = error;
            if (axiosError.response) {
                const status = axiosError.response.status;
                const statusText = axiosError.response.statusText || `HTTP ${status} Error`;
                const errorData = axiosError.response.data;
                const errorMessage = `API Request Failed: ${status} - ${statusText}. ${JSON.stringify(errorData) ||
                    "Something went wrong"}`;
                throw new error_1.ApiError(errorMessage, {
                    status: status,
                    statusText: statusText,
                    data: errorData,
                    type: error_types_1.ApiErrorType.ServerResponseError,
                });
            }
            else if (axiosError.request) {
                throw new error_1.ApiError("Network Error: No response received. Please check your internet connection or the server status", { type: error_types_1.ApiErrorType.NetworkError });
            }
            else {
                throw new error_1.ApiError(`Request Setup Error: ${axiosError.message}`, {
                    type: error_types_1.ApiErrorType.RequestSetupError,
                });
            }
        }
        else {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new error_1.ApiError(`An unexpected error occurred: ${errorMessage}`, {
                type: error_types_1.ApiErrorType.UnknownError,
            });
        }
    }
}
axios_1.default.interceptors.request.use(function (config) {
    console.log("Axios Request:", config);
    console.log("Axios Request URL:", config.url);
    console.log("Axios Request Method:", config.method);
    console.log("Axios Request Headers:", config.headers);
    console.log("Axios Request Data:", config.data);
    return config;
}, function (error) {
    console.error("Axios Request Error:", error);
    return Promise.reject(error);
});
//# sourceMappingURL=rpc-utils.js.map