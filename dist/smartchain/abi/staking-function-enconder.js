"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodeGetValidatorsData = encodeGetValidatorsData;
exports.encodeGetSharesByPooledBNBData = encodeGetSharesByPooledBNBData;
exports.encodeGetPooledBNBData = encodeGetPooledBNBData;
exports.encodeUnbondRequestData = encodeUnbondRequestData;
exports.encodeClaimableUnbondRequestData = encodeClaimableUnbondRequestData;
exports.encodePendingUnbondRequestData = encodePendingUnbondRequestData;
const abi_utils_1 = require("./abi-utils");
function encodeGetValidatorsData() {
    return (0, abi_utils_1.encodeFunctionCall)("getValidators(uint256,uint256)", [
        { name: "offset", type: "uint256" },
        { name: "limit", type: "uint256" },
    ], [0, 100]);
}
function encodeGetSharesByPooledBNBData(amount) {
    return (0, abi_utils_1.encodeFunctionCall)("getSharesByPooledBNB(uint256)", [{ name: "bnbAmount", type: "uint256" }], [amount]);
}
function encodeGetPooledBNBData(delegator) {
    return (0, abi_utils_1.encodeFunctionCall)("getPooledBNB(address)", [{ name: "accout", type: "address" }], [delegator]);
}
function encodeUnbondRequestData(delegator) {
    return (0, abi_utils_1.encodeFunctionCall)("unbondRequest(address)", [
        { name: "delegator", type: "address" },
        { name: "_index", type: "uint256" },
    ], [delegator, 0]);
}
function encodeClaimableUnbondRequestData(delegator) {
    return (0, abi_utils_1.encodeFunctionCall)("claimableUnbondRequest(address)", [{ name: "delegator", type: "address" }], [delegator]);
}
function encodePendingUnbondRequestData(delegator) {
    return (0, abi_utils_1.encodeFunctionCall)("pendingUnbondRequest(address)", [{ name: "delegator", type: "address" }], [delegator]);
}
//# sourceMappingURL=staking-function-enconder.js.map