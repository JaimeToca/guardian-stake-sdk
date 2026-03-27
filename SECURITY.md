# Security Policy

## Disclaimer

⚠️ **Important Notice**

This SDK has **not been formally audited** and is provided **as-is**, without any warranties or guarantees of security or correctness.

- The SDK **does not store, persist, or retain private keys**.
- Private keys are **only passed temporarily** for transaction signing.
- The SDK is designed to be **stateless** and does not manage user funds or accounts.

**By using this SDK, you acknowledge that you are solely responsible for its use.**  
Use it at your own risk. Always follow best practices for key management and security.

---

## Supported versions

Only the latest published version of each package receives security fixes.

| Package | Supported |
|---------|-----------|
| `@guardian/sdk` | latest ✅ |
| `@guardian/bsc` | latest ✅ |

---

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report vulnerabilities privately via one of these channels:

- **GitHub private vulnerability reporting** — use the [Security tab](https://github.com/JaimeToca/bnb-native-staking/security/advisories/new) of this repository (recommended).
- **Email** — send details to the maintainer listed in the package.json `author` field.

### What to include

A useful report contains:

- A description of the vulnerability and its potential impact.
- Steps to reproduce or a minimal proof-of-concept.
- The affected package(s) and version(s).
- Any suggested fix, if you have one.

### What to expect

- **Acknowledgement** within 3 business days.
- **Assessment** (accepted / not a vulnerability / out of scope) within 7 business days.
- **Fix and coordinated disclosure** as soon as the patch is ready — typically within 30 days for critical issues.

We follow [responsible disclosure](https://en.wikipedia.org/wiki/Coordinated_vulnerability_disclosure): you will be credited in the GitHub Security Advisory and CHANGELOG unless you prefer to remain anonymous.

---

## Scope

This SDK is provided as a **stateless utility for transaction formatting and signing only**. It does not manage accounts, store private keys, or guarantee transaction safety.

### In scope

We may consider reports limited strictly to:

- **Direct vulnerabilities in the SDK codebase** that demonstrably:
  - Expose user-provided data during execution (e.g. unintended logging).
  - Break the intended signing flow in a way that deviates from documented behavior.

### Out of scope

All other issues are **out of scope**, including but not limited to:

- Any **loss of funds**, incorrect transactions, or unintended behavior resulting from use of the SDK.
- **Private key handling outside the immediate signing call**, including storage, transport, or user environment.
- Any **integration, implementation, or misuse** of the SDK.
- **Wallets, applications, or services** built on top of this SDK.
- **Blockchain protocol behavior**, chain reorganizations, or validator issues.
- **RPC nodes, third-party services, or infrastructure**.
- **Dependencies**, unless a vulnerability is proven to be directly exploitable through this SDK.
- Any **security assumptions or guarantees** not explicitly stated in the documentation.