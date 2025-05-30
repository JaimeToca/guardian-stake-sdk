"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeeService = void 0;
class FeeService {
    estimateFee(transaction) {
        return {
            gasPrice: BigInt(0),
            gasLimit: BigInt(0),
            total: BigInt(0),
        };
    }
}
exports.FeeService = FeeService;
//# sourceMappingURL=fee-service.js.map