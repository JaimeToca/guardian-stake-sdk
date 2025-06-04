"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodeGetValidatorsData = encodeGetValidatorsData;
exports.encodeGetSharesByPooledBNBData = encodeGetSharesByPooledBNBData;
exports.encodeGetPooledBNBData = encodeGetPooledBNBData;
exports.encodeUnbondRequestData = encodeUnbondRequestData;
exports.encodePendingUnbondRequestData = encodePendingUnbondRequestData;
exports.encodeDelegate = encodeDelegate;
exports.encodeUndelegate = encodeUndelegate;
exports.encodeRedelegate = encodeRedelegate;
exports.encodeClaim = encodeClaim;
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
function encodeUnbondRequestData(delegator, index) {
    return (0, abi_utils_1.encodeFunctionCall)("unbondRequest(address,uint256)", [
        { name: "delegator", type: "address" },
        { name: "_index", type: "uint256" },
    ], [delegator, index]);
}
function encodePendingUnbondRequestData(delegator) {
    return (0, abi_utils_1.encodeFunctionCall)("pendingUnbondRequest(address)", [{ name: "delegator", type: "address" }], [delegator]);
}
function encodeDelegate(operatorAddress) {
    return (0, abi_utils_1.encodeFunctionCall)("delegate(address,bool)", [
        { name: "operatorAddress", type: "address" },
        { name: "delegateVotePower", type: "bool" },
    ], [operatorAddress, false]);
}
function encodeUndelegate(operatorAddress, shares) {
    return (0, abi_utils_1.encodeFunctionCall)("undelegate(address,uint256)", [
        { name: "operatorAddress", type: "address" },
        { name: "shares", type: "uint256" },
    ], [operatorAddress, shares]);
}
function encodeRedelegate(fromOperatorAddress, toOperatorAddress, shares) {
    return (0, abi_utils_1.encodeFunctionCall)("redelegate(address,address,uint256,bool)", [
        { name: "srcValidator", type: "address" },
        { name: "dstValidator", type: "address" },
        { name: "shares", type: "uint256" },
        { name: "delegateVotePower", type: "bool" },
    ], [fromOperatorAddress, toOperatorAddress, shares, false]);
}
function encodeClaim(operatorAddress, index) {
    return (0, abi_utils_1.encodeFunctionCall)("claim(address,uint256)", [
        { name: "operatorAddress", type: "address" },
        { name: "requestNumber", type: "uint256" },
    ], [operatorAddress, index]);
}
//# sourceMappingURL=staking-function-enconder.js.map