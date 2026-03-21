"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodeFunctionCall = encodeFunctionCall;
exports.processSingleMulticallResult = processSingleMulticallResult;
const viem_1 = require("viem");
function encodeFunctionCall(functionSignature, types = [], params = []) {
    const selector = (0, viem_1.toFunctionSelector)(functionSignature);
    const encodedArgs = types.length
        ? (0, viem_1.encodeAbiParameters)(types, params).slice(2)
        : "";
    return `${selector}${encodedArgs}`;
}
function processSingleMulticallResult(item) {
    if (item.status === "success" && item.result !== undefined && item.result > 0n) {
        return item.result;
    }
    return undefined;
}
//# sourceMappingURL=abi-utils.js.map