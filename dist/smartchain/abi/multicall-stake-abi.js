"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STAKING_CONTRACT = exports.multicallStakeAbi = void 0;
const viem_1 = require("viem");
exports.multicallStakeAbi = (0, viem_1.parseAbi)([
    "function getPooledBNB(address) view returns (uint256)",
    "function pendingUnbondRequest(address) view returns (uint256)",
]);
exports.STAKING_CONTRACT = "0x0000000000000000000000000000000000002002";
//# sourceMappingURL=multicall-stake-abi.js.map