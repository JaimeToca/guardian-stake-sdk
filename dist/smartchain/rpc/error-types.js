"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiErrorType = void 0;
var ApiErrorType;
(function (ApiErrorType) {
    ApiErrorType[ApiErrorType["ServerResponseError"] = 0] = "ServerResponseError";
    ApiErrorType[ApiErrorType["NetworkError"] = 1] = "NetworkError";
    ApiErrorType[ApiErrorType["RequestSetupError"] = 2] = "RequestSetupError";
    ApiErrorType[ApiErrorType["UnexpectedError"] = 3] = "UnexpectedError";
    ApiErrorType[ApiErrorType["UnknownError"] = 4] = "UnknownError";
})(ApiErrorType || (exports.ApiErrorType = ApiErrorType = {}));
//# sourceMappingURL=error-types.js.map