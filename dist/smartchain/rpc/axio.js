"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
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
//# sourceMappingURL=axio.js.map