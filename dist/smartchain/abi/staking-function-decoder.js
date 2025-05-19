"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeGetValidators = decodeGetValidators;
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
//# sourceMappingURL=staking-function-decoder.js.map