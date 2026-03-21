"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiError = void 0;
const error_types_1 = require("../../common/rpc/error-types");
class ApiError extends Error {
    status;
    statusText;
    data;
    type;
    constructor(message, details = {}) {
        super(message);
        this.name = "ApiError";
        this.status = details.status;
        this.statusText = details.statusText;
        this.data = details.data;
        this.type = details.type || error_types_1.ApiErrorType.UnknownError;
    }
}
exports.ApiError = ApiError;
//# sourceMappingURL=rpc-error.js.map