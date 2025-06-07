"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSigningWithPrivateKey = isSigningWithPrivateKey;
exports.isSigningWithAccount = isSigningWithAccount;
function isSigningWithPrivateKey(args) {
    return "privateKey" in args;
}
function isSigningWithAccount(args) {
    return "account" in args;
}
//# sourceMappingURL=sign-types.js.map