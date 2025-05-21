"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.multicallStakeAbi = void 0;
const viem_1 = require("viem");
exports.multicallStakeAbi = (0, viem_1.parseAbi)([
    'function getPooledBNB(address) view returns (uint256)',
    'function pendingUnbondRequest(address) view returns (uint256)',
]);
//# sourceMappingURL=stake-abi.js.map