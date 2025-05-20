"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DelegationStatus = exports.ValidatorStatus = void 0;
var ValidatorStatus;
(function (ValidatorStatus) {
    ValidatorStatus[ValidatorStatus["Active"] = 0] = "Active";
    ValidatorStatus[ValidatorStatus["Inactive"] = 1] = "Inactive";
    ValidatorStatus[ValidatorStatus["Jailed"] = 2] = "Jailed";
})(ValidatorStatus || (exports.ValidatorStatus = ValidatorStatus = {}));
var DelegationStatus;
(function (DelegationStatus) {
    DelegationStatus[DelegationStatus["Active"] = 0] = "Active";
    DelegationStatus[DelegationStatus["Pending"] = 1] = "Pending";
    DelegationStatus[DelegationStatus["Claimable"] = 2] = "Claimable";
    DelegationStatus[DelegationStatus["Inactive"] = 3] = "Inactive";
})(DelegationStatus || (exports.DelegationStatus = DelegationStatus = {}));
//# sourceMappingURL=staking-types.js.map