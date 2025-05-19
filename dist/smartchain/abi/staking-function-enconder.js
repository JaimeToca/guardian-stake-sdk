"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getValidatorsData = getValidatorsData;
exports.getSharesByPooledBNBData = getSharesByPooledBNBData;
exports.getPooledBNBData = getPooledBNBData;
exports.unbondRequestData = unbondRequestData;
exports.claimableUnbondRequestData = claimableUnbondRequestData;
exports.pendingUnbondRequestData = pendingUnbondRequestData;
const abi_utils_1 = require("./abi-utils");
function getValidatorsData() {
    return (0, abi_utils_1.encodeFunctionCall)("getValidators(uint256,uint256)", [
        { name: "offset", type: "uint256" },
        { name: "limit", type: "uint256" },
    ], [0, 100]);
}
function getSharesByPooledBNBData(amount) {
    return (0, abi_utils_1.encodeFunctionCall)("getSharesByPooledBNB(uint256)", [{ name: "bnbAmount", type: "uint256" }], [amount]);
}
function getPooledBNBData(delegator) {
    return (0, abi_utils_1.encodeFunctionCall)("getPooledBNB(address)", [{ name: "accout", type: "address" }], [delegator]);
}
function unbondRequestData(delegator) {
    return (0, abi_utils_1.encodeFunctionCall)("unbondRequest(address)", [
        { name: "delegator", type: "address" },
        { name: "_index", type: "uint256" },
    ], [delegator, 0]);
}
function claimableUnbondRequestData(delegator) {
    return (0, abi_utils_1.encodeFunctionCall)("claimableUnbondRequest(address)", [{ name: "delegator", type: "address" }], [delegator]);
}
function pendingUnbondRequestData(delegator) {
    return (0, abi_utils_1.encodeFunctionCall)("pendingUnbondRequest(address)", [{ name: "delegator", type: "address" }], [delegator]);
}
//# sourceMappingURL=staking-function-enconder.js.map