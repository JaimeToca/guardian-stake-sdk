"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeGetValidators = decodeGetValidators;
exports.decodeUnbond = decodeUnbond;
const viem_1 = require("viem");
function decodeGetValidators(data) {
    const decodedResult = (0, viem_1.decodeAbiParameters)([
        { name: "operatorAddrs", type: "address[]" },
        { name: "creditAddrs", type: "address[]" },
        { name: "totalLength", type: "uint256" },
    ], data);
    return [
        decodedResult[0],
        decodedResult[1],
        decodedResult[2],
    ];
}
function decodeUnbond(data) {
    const decodedResult = (0, viem_1.decodeAbiParameters)([
        { name: "shares", type: "uint256" },
        { name: "bnbAmount", type: "uint256" },
        { name: "unlockTime", type: "uint256" },
    ], data);
    return [
        decodedResult[0],
        decodedResult[1],
        decodedResult[2],
    ];
}
//# sourceMappingURL=staking-function-decoder.js.map