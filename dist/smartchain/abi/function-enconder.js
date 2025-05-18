"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getValidatorsData = getValidatorsData;
exports.getSharesByPooledBNBData = getSharesByPooledBNBData;
exports.getPooledBNBData = getPooledBNBData;
exports.unbondRequestData = unbondRequestData;
exports.claimableUnbondRequestData = claimableUnbondRequestData;
exports.pendingUnbondRequestData = pendingUnbondRequestData;
const ethers_1 = require("ethers");
const abiCoder = new ethers_1.ethers.AbiCoder();
function getValidatorsData() {
    let x = encodeFunctionCall("getValidators(uint256,uint256)", ["uint256", "uint256"], [0, 100]);
    console.log(x);
    return encodeFunctionCall("getValidators(uint256,uint256)", ["uint256", "uint256"], [0, 100]);
}
function getSharesByPooledBNBData(amount) {
    return encodeFunctionCall("getSharesByPooledBNB(uint256)", ["uint256"], [amount]);
}
function getPooledBNBData(delegator) {
    return encodeFunctionCall("getPooledBNB(address)", ["address"], [delegator]);
}
function unbondRequestData(delegator) {
    return encodeFunctionCall("unbondRequest(address)", ["address"], [delegator]);
}
function claimableUnbondRequestData(delegator) {
    return encodeFunctionCall("claimableUnbondRequest(address)", ["address"], [delegator]);
}
function pendingUnbondRequestData(delegator) {
    return encodeFunctionCall("pendingUnbondRequest(address)", ["address"], [delegator]);
}
function encodeFunctionCall(functionSignature, types = [], params = []) {
    const selector = ethers_1.ethers.id(functionSignature).slice(0, 10);
    const encodedArgs = types.length
        ? abiCoder.encode(types, params).slice(2)
        : "";
    return selector + encodedArgs;
}
//# sourceMappingURL=function-enconder.js.map