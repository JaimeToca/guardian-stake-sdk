"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STAKING_CONTRACT = void 0;
exports.encodeFunctionCall = encodeFunctionCall;
const viem_1 = require("viem");
exports.STAKING_CONTRACT = "0x0000000000000000000000000000000000002002";
function encodeFunctionCall(functionSignature, types = [], params = []) {
    const selector = (0, viem_1.toFunctionSelector)(functionSignature);
    const encodedArgs = types.length
        ? (0, viem_1.encodeAbiParameters)(types, params).slice(2)
        : "";
    return (`${selector}${encodedArgs}`);
}
//# sourceMappingURL=abi-utils.js.map