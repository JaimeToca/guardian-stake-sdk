#!/usr/bin/env python3
"""
Guardian SDK — new chain scaffold
==================================
Generates the full package skeleton for a new chain integration.

Usage
-----
    python scripts/scaffold_chain.py <chain-id> [options]

Examples
--------
    # EVM chain
    python scripts/scaffold_chain.py ethereum --symbol ETH --chain-id 1 --explorer https://etherscan.io

    # Non-EVM chain (omits viem dependency)
    python scripts/scaffold_chain.py tron --symbol TRX --chain-id 728126428 --explorer https://tronscan.org --no-viem

Options
-------
    --symbol      Native token symbol   (default: uppercased chain-id)
    --chain-id    Numeric chain ID      (default: 0 — fill in later)
    --explorer    Block explorer URL    (default: https://<chain>scan.io)
    --no-viem     Omit viem dependency  (for non-EVM chains)

Requirements
------------
    Python 3.8+  (no third-party packages needed)
"""

import argparse
import json
import os
import re
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Resolve repo root (two levels up from this script)
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parent.parent


# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Scaffold a new Guardian SDK chain package",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("chain_id", help="Chain slug used for the package name, e.g. 'tron' or 'ethereum'")
    parser.add_argument("--symbol",   default=None, help="Native token symbol (default: uppercased chain-id)")
    parser.add_argument("--chain-id", dest="numeric_chain_id", default=None, help="Numeric chain ID (default: 0)")
    parser.add_argument("--explorer", default=None, help="Block explorer base URL")
    parser.add_argument("--no-viem",  dest="no_viem", action="store_true", help="Omit viem dependency (non-EVM chains)")
    return parser.parse_args()


# ---------------------------------------------------------------------------
# Derived names
# ---------------------------------------------------------------------------

def kebab_to_camel(s: str) -> str:
    """tron → tron, bnb-smart-chain → bnbSmartChain"""
    parts = s.split("-")
    return parts[0] + "".join(p.capitalize() for p in parts[1:])


def kebab_to_screaming_snake(s: str) -> str:
    """bnb-smart-chain → BNB_SMART_CHAIN"""
    return s.upper().replace("-", "_")


# ---------------------------------------------------------------------------
# File writer
# ---------------------------------------------------------------------------

def write(pkg_dir: Path, rel_path: str, content: str) -> None:
    target = pkg_dir / rel_path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    print(f"  created  {rel_path}")


# ---------------------------------------------------------------------------
# File templates
# ---------------------------------------------------------------------------

def make_package_json(slug: str, symbol: str, no_viem: bool) -> str:
    pkg = {
        "name": f"@guardian/{slug}",
        "version": "0.1.0",
        "description": f"Guardian SDK for {symbol}",
        "main": "./dist/cjs/index.js",
        "module": "./dist/esm/index.js",
        "types": "./dist/cjs/index.d.ts",
        "exports": {
            ".": {
                "types": "./dist/cjs/index.d.ts",
                "import": "./dist/esm/index.js",
                "require": "./dist/cjs/index.js",
            }
        },
        "files": ["dist"],
        "sideEffects": False,
        "scripts": {
            "build": "tsc -p tsconfig.json && tsc -p tsconfig.esm.json",
            "typecheck": "tsc --noEmit",
            "prepublishOnly": "npm run build",
            "test": "vitest run",
            "test:watch": "vitest",
        },
        "dependencies": {"@guardian/sdk": "*"},
        "devDependencies": {"vitest": "^3.0.0"},
        "engines": {"node": ">=18"},
        "keywords": [slug, "staking", "web3", "blockchain", "sdk", "guardian"],
        "license": "MIT",
    }
    if not no_viem:
        pkg["peerDependencies"] = {"viem": "^2.47.5"}
        pkg["devDependencies"]["viem"] = "^2.47.6"

    return json.dumps(pkg, indent=2)


def make_tsconfig_cjs() -> str:
    return """{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist/cjs"
  },
  "exclude": ["node_modules", "dist", "tests", "vitest.config.ts"]
}
"""


def make_tsconfig_esm() -> str:
    return """{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist/esm",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "declaration": false,
    "declarationMap": false,
    "sourceMap": false
  },
  "exclude": ["node_modules", "dist", "tests", "vitest.config.ts"]
}
"""


def make_tsconfig_test() -> str:
    return """{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "paths": {
      "@guardian/sdk": ["../sdk/src/index.ts"],
      "@guardian/sdk/testing": ["../sdk/src/testing/index.ts"]
    }
  },
  "include": ["src/**/*", "tests/**/*"],
  "exclude": ["node_modules", "dist"]
}
"""


def make_vitest_config() -> str:
    return """import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@guardian/sdk": resolve(__dirname, "../sdk/src/index.ts"),
      "@guardian/sdk/testing": resolve(__dirname, "../sdk/src/testing/index.ts"),
    },
  },
});
"""


def make_chain_index(slug: str, symbol: str, numeric_chain_id: str, explorer: str, chain_const: str) -> str:
    return f"""import type {{ GuardianChain }} from "@guardian/sdk";
import {{ ChainEcosystemType, GuardianChainType }} from "@guardian/sdk";

/** {symbol} mainnet configuration. */
export const {chain_const}: GuardianChain = {{
  id: "{slug}-mainnet",
  type: GuardianChainType.Smartchain, // TODO: adjust if not EVM
  symbol: "{symbol}",
  decimals: 18, // TODO: confirm native token decimals
  ecosystem: ChainEcosystemType.Ethereum, // TODO: adjust if not EVM
  chainId: "{numeric_chain_id}",
  explorer: "{explorer}",
}};

/** All chains supported by `@guardian/{slug}`. */
export const SUPPORTED_CHAINS: GuardianChain[] = [{chain_const}];

/** Retrieves a supported chain by its `id` string. */
export const getChainById = (id: string): GuardianChain | undefined =>
  SUPPORTED_CHAINS.find((chain) => chain.id === id);

/** Returns true if the given chain is in the supported chains list. */
export const isSupportedChain = (chain: GuardianChain): boolean =>
  SUPPORTED_CHAINS.some(
    (supported) => supported.id === chain.id && supported.chainId === chain.chainId
  );
"""


def make_staking_service(slug: str) -> str:
    return f"""import type {{ CacheContract, Logger, Delegations, Validator, StakingServiceContract }} from "@guardian/sdk";
import {{ NoopLogger }} from "@guardian/sdk";

// TODO: import your RPC client types

export class StakingService implements StakingServiceContract {{
  private static readonly VALIDATOR_CACHE_KEY = "{slug}-validators";

  constructor(
    private readonly cache: CacheContract<string, Validator[]>,
    // TODO: inject RPC clients
    private readonly logger: Logger = new NoopLogger()
  ) {{}}

  async getValidators(): Promise<Validator[]> {{
    const cached = this.cache.get(StakingService.VALIDATOR_CACHE_KEY);
    if (cached) {{
      this.logger.debug("StakingService: validators cache hit", {{ count: cached.length }});
      return cached;
    }}

    this.logger.debug("StakingService: validators cache miss — fetching from RPC");

    // TODO: fetch validators from chain RPC / REST API
    const validators: Validator[] = [];

    this.cache.set(StakingService.VALIDATOR_CACHE_KEY, validators);
    this.logger.debug("StakingService: validators cached", {{ count: validators.length }});
    return validators;
  }}

  async getDelegations(_address: string): Promise<Delegations> {{
    // TODO: fetch active + pending/claimable delegations and protocol summary
    throw new Error("getDelegations: not yet implemented");
  }}
}}
"""


def make_balance_service() -> str:
    return """import type { Balance, BalanceServiceContract, Logger } from "@guardian/sdk";
import { NoopLogger } from "@guardian/sdk";

export class BalanceService implements BalanceServiceContract {
  constructor(
    // TODO: inject staking service or RPC client
    private readonly logger: Logger = new NoopLogger()
  ) {}

  async getBalances(_address: string): Promise<Balance[]> {
    // TODO: return Available, Staked, Pending, Claimable balances
    throw new Error("getBalances: not yet implemented");
  }
}
"""


def make_fee_service() -> str:
    return """import type { Fee, FeeServiceContract, Transaction, Logger } from "@guardian/sdk";
import { NoopLogger } from "@guardian/sdk";

export class FeeService implements FeeServiceContract {
  constructor(
    // TODO: inject RPC client for simulation
    private readonly logger: Logger = new NoopLogger()
  ) {}

  async estimateFee(_transaction: Transaction): Promise<Fee> {
    // TODO: simulate the transaction and return gas/fee estimate
    throw new Error("estimateFee: not yet implemented");
  }
}
"""


def make_nonce_service() -> str:
    return """import type { NonceServiceContract } from "@guardian/sdk";

export class NonceService implements NonceServiceContract {
  constructor(
    // TODO: inject RPC client
  ) {}

  async getNonce(_address: string): Promise<number> {
    // TODO: fetch account sequence / nonce
    throw new Error("getNonce: not yet implemented");
  }
}
"""


def make_sign_service() -> str:
    return """import type {
  SignServiceContract,
  SigningWithPrivateKey,
  BaseSignArgs,
  PrehashResult,
  CompileArgs,
  Transaction,
  Logger,
} from "@guardian/sdk";
import { NoopLogger } from "@guardian/sdk";
import type { HexString } from "@guardian/sdk";

export class SignService implements SignServiceContract {
  constructor(private readonly logger: Logger = new NoopLogger()) {}

  async sign(_signingArgs: SigningWithPrivateKey): Promise<string> {
    // TODO: build + sign transaction with private key
    throw new Error("sign: not yet implemented");
  }

  async prehash(_preHashArgs: BaseSignArgs): Promise<PrehashResult> {
    // TODO: serialize unsigned transaction for external/MPC signing
    throw new Error("prehash: not yet implemented");
  }

  async compile(_compileArgs: CompileArgs): Promise<string> {
    // TODO: reassemble signed transaction from r, s, v components
    throw new Error("compile: not yet implemented");
  }

  buildCallData(_transaction: Transaction): { data: HexString; amount: bigint } {
    // TODO: ABI-encode (EVM) or proto-encode the transaction
    throw new Error("buildCallData: not yet implemented");
  }
}
"""


def make_guardian_service(chain_const: str) -> str:
    return f"""import type {{
  GuardianServiceContract,
  GuardianChain,
  Validator,
  Delegations,
  Balance,
  Fee,
  Transaction,
  SigningWithPrivateKey,
  BaseSignArgs,
  PrehashResult,
  CompileArgs,
  StakingServiceContract,
  BalanceServiceContract,
  FeeServiceContract,
  SignServiceContract,
  NonceServiceContract,
}} from "@guardian/sdk";

export class GuardianService implements GuardianServiceContract {{
  constructor(
    private readonly chain: GuardianChain,
    private readonly balanceService: BalanceServiceContract,
    private readonly nonceService: NonceServiceContract,
    private readonly feeService: FeeServiceContract,
    private readonly signService: SignServiceContract,
    private readonly stakingService: StakingServiceContract
  ) {{}}

  getChainInfo(): GuardianChain {{
    return this.chain;
  }}

  getValidators(): Promise<Validator[]> {{
    return this.stakingService.getValidators();
  }}

  getDelegations(address: string): Promise<Delegations> {{
    return this.stakingService.getDelegations(address);
  }}

  getBalances(address: string): Promise<Balance[]> {{
    return this.balanceService.getBalances(address);
  }}

  getNonce(address: string): Promise<number> {{
    return this.nonceService.getNonce(address);
  }}

  estimateFee(transaction: Transaction): Promise<Fee> {{
    return this.feeService.estimateFee(transaction);
  }}

  sign(signingArgs: SigningWithPrivateKey): Promise<string> {{
    return this.signService.sign(signingArgs);
  }}

  prehash(preHashArgs: BaseSignArgs): Promise<PrehashResult> {{
    return this.signService.prehash(preHashArgs);
  }}

  compile(compileArgs: CompileArgs): Promise<string> {{
    return this.signService.compile(compileArgs);
  }}
}}
"""


def make_di_factory(slug: str, symbol: str, chain_const: str, factory_fn: str) -> str:
    pkg = f"@guardian/{slug}"
    return f"""import type {{ GuardianServiceContract, Logger }} from "@guardian/sdk";
import {{ InMemoryCache, NoopLogger, validateRpcUrl }} from "@guardian/sdk";
import type {{ Validator }} from "@guardian/sdk";
import {{ {chain_const} }} from "../chain";
import {{ GuardianService }} from "./services/guardian-service";
import {{ StakingService }} from "./services/staking-service";
import {{ BalanceService }} from "./services/balance-service";
import {{ FeeService }} from "./services/fee-service";
import {{ SignService }} from "./services/sign-service";
import {{ NonceService }} from "./services/nonce-service";

/**
 * Creates a GuardianServiceContract for {symbol}.
 * Pass the result directly to the `GuardianSDK` constructor.
 *
 * @example
 * ```typescript
 * import {{ GuardianSDK }} from "@guardian/sdk";
 * import {{ {factory_fn}, {chain_const} }} from "{pkg}";
 *
 * const sdk = new GuardianSDK([
 *   {factory_fn}({{ rpcUrl: "https://<rpc-endpoint>" }}),
 * ]);
 * ```
 */
export function {factory_fn}(config: {{ rpcUrl: string; logger?: Logger }}): GuardianServiceContract {{
  validateRpcUrl(config.rpcUrl);
  const logger = config.logger ?? new NoopLogger();

  // TODO: create your chain-specific RPC client(s) here, e.g.:
  // const client = createPublicClient({{ ... }});

  const cache = new InMemoryCache<string, Validator[]>();
  const stakingService = new StakingService(cache, logger);
  const balanceService = new BalanceService(logger);
  const nonceService = new NonceService();
  const signService = new SignService(logger);
  const feeService = new FeeService(logger);

  return new GuardianService(
    {chain_const},
    balanceService,
    nonceService,
    feeService,
    signService,
    stakingService
  );
}}
"""


def make_src_index(slug: str, chain_const: str, factory_fn: str) -> str:
    symbol_upper = slug.upper().replace("-", " ")
    return f"""// Re-export everything from @guardian/sdk so consumers need only one import
export * from "@guardian/sdk";

// {symbol_upper}-specific public API
export {{ {factory_fn} }} from "./mainnet";
export {{ {chain_const}, SUPPORTED_CHAINS, getChainById, isSupportedChain }} from "./chain";
"""


def make_config_test(slug: str, factory_fn: str) -> str:
    return f"""import {{ describe, it, expect }} from "vitest";
import {{ ConfigError }} from "@guardian/sdk";
import {{ {factory_fn} }} from "../src/mainnet";

describe("{factory_fn}()", () => {{
  it("throws ConfigError for a non-URL string", () => {{
    expect.assertions(2);
    try {{
      {factory_fn}({{ rpcUrl: "not-a-url" }});
    }} catch (err) {{
      expect(err).toBeInstanceOf(ConfigError);
      expect((err as ConfigError).code).toBe("INVALID_RPC_URL");
    }}
  }});

  it("throws ConfigError for an unsupported protocol", () => {{
    expect.assertions(2);
    try {{
      {factory_fn}({{ rpcUrl: "ftp://example.com" }});
    }} catch (err) {{
      expect(err).toBeInstanceOf(ConfigError);
      expect((err as ConfigError).code).toBe("INVALID_RPC_URL");
    }}
  }});

  it("does not throw for a valid https URL", () => {{
    expect(() => {factory_fn}({{ rpcUrl: "https://rpc.example.com" }})).not.toThrow();
  }});
}});
"""


def make_staking_test(slug: str) -> str:
    return f"""import {{ describe, it, expect }} from "vitest";
import {{ StakingService }} from "../../src/mainnet/services/staking-service";
import {{ InMemoryCache }} from "@guardian/sdk";
import type {{ Validator }} from "@guardian/sdk";
import {{ mockValidator }} from "@guardian/sdk/testing";

describe("StakingService", () => {{
  describe("getValidators()", () => {{
    it("returns cached validators on second call", async () => {{
      const cache = new InMemoryCache<string, Validator[]>();
      const service = new StakingService(cache);

      cache.set("{slug}-validators", [mockValidator()]);

      const result = await service.getValidators();
      expect(result).toHaveLength(1);
    }});

    // TODO: add tests for fetching from RPC, null APY handling, missing fields, etc.
  }});
}});
"""


def make_sign_test(chain_const: str) -> str:
    return f"""import {{ describe, it }} from "vitest";
import {{ SignService }} from "../../src/mainnet/services/sign-service";
import {{ {chain_const} }} from "../../src/chain";

describe("SignService", () => {{
  const _service = new SignService();
  const _chain = {chain_const};

  describe("buildCallData", () => {{
    it.todo("encodes a Delegate transaction");
    it.todo("encodes an Undelegate transaction");
    it.todo("encodes a Redelegate transaction");
    it.todo("encodes a Claim transaction");
  }});

  describe("prehash", () => {{
    it.todo("returns a serialized transaction and the original sign args");
  }});

  describe("compile", () => {{
    it.todo("produces a valid signed transaction hex from r, s, v components");
  }});
}});
"""


def make_example(slug: str, symbol: str, chain_const: str, factory_fn: str) -> str:
    pkg = f"@guardian/{slug}"
    return f"""/**
 * {symbol} staking — quick-start sample
 * Run: npx tsx examples/{slug}-sample.ts
 */
import {{ GuardianSDK }} from "@guardian/sdk";
import {{ {factory_fn}, {chain_const} }} from "{pkg}";

const sdk = new GuardianSDK([
  {factory_fn}({{ rpcUrl: "https://<rpc-endpoint>" /* TODO: replace */ }}),
]);

// --- Validators --------------------------------------------------------------
const validators = await sdk.getValidators({chain_const});
console.log(`validators (${{validators.length}}):`, validators.slice(0, 3));

// --- Delegations -------------------------------------------------------------
const ADDRESS = "<your-address>"; // TODO: replace
const {{ delegations, stakingSummary }} = await sdk.getDelegations(ADDRESS, {chain_const});
console.log("stakingSummary:", stakingSummary);
console.log(`delegations (${{delegations.length}}):`, delegations);

// --- Balances ----------------------------------------------------------------
const balances = await sdk.getBalances(ADDRESS, {chain_const});
console.log("balances:", balances);
"""


# ---------------------------------------------------------------------------
# Patch helpers
# ---------------------------------------------------------------------------

def patch_eslint(root: Path, slug: str) -> None:
    eslint_path = root / "eslint.config.mjs"
    src = eslint_path.read_text(encoding="utf-8")

    entries = [
        f'"./packages/{slug}/tsconfig.json"',
        f'"./packages/{slug}/tsconfig.test.json"',
    ]

    patched = src
    changed = False
    for entry in entries:
        if entry not in patched:
            # Insert after the last existing tsconfig.test.json line in the project array
            patched = re.sub(
                r'("\.\/packages\/[^"]+tsconfig\.test\.json")(,?\s*\])',
                rf'\1,\n        {entry}\2',
                patched,
            )
            changed = True

    if changed:
        eslint_path.write_text(patched, encoding="utf-8")
        print("  patched  eslint.config.mjs")
    else:
        print("  skipped  eslint.config.mjs (entries already present)")


def patch_root_package_json(root: Path, slug: str) -> None:
    pkg_path = root / "package.json"
    pkg = json.loads(pkg_path.read_text(encoding="utf-8"))

    build_script: str = pkg["scripts"].get("build", "")
    new_entry = f"npm run build -w packages/{slug}"

    if new_entry not in build_script:
        pkg["scripts"]["build"] = build_script + f" && {new_entry}"
        pkg_path.write_text(json.dumps(pkg, indent=2) + "\n", encoding="utf-8")
        print("  patched  package.json (build script)")
    else:
        print("  skipped  package.json (entry already present)")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    args = parse_args()

    slug = re.sub(r"[^a-z0-9-]", "-", args.chain_id.lower())
    symbol = args.symbol or slug.upper()
    numeric_chain_id = args.numeric_chain_id or "0 /* TODO: set correct chain ID */"
    explorer = args.explorer or f"https://{slug}scan.io"
    chain_const = kebab_to_screaming_snake(slug) + "_CHAIN"
    factory_fn = kebab_to_camel(slug)
    no_viem = args.no_viem

    pkg_dir = ROOT / "packages" / slug

    if pkg_dir.exists():
        print(f"\n❌  packages/{slug} already exists. Aborting to avoid overwriting work.\n")
        sys.exit(1)

    print(f"\nScaffolding @guardian/{slug} ...\n")

    # -- Config files ---------------------------------------------------------
    write(pkg_dir, "package.json",        make_package_json(slug, symbol, no_viem))
    write(pkg_dir, "tsconfig.json",       make_tsconfig_cjs())
    write(pkg_dir, "tsconfig.esm.json",   make_tsconfig_esm())
    write(pkg_dir, "tsconfig.test.json",  make_tsconfig_test())
    write(pkg_dir, "vitest.config.ts",    make_vitest_config())

    # -- Source files ---------------------------------------------------------
    write(pkg_dir, "src/chain/index.ts",
          make_chain_index(slug, symbol, numeric_chain_id, explorer, chain_const))
    write(pkg_dir, "src/mainnet/services/staking-service.ts",  make_staking_service(slug))
    write(pkg_dir, "src/mainnet/services/balance-service.ts",  make_balance_service())
    write(pkg_dir, "src/mainnet/services/fee-service.ts",      make_fee_service())
    write(pkg_dir, "src/mainnet/services/nonce-service.ts",    make_nonce_service())
    write(pkg_dir, "src/mainnet/services/sign-service.ts",     make_sign_service())
    write(pkg_dir, "src/mainnet/services/guardian-service.ts", make_guardian_service(chain_const))
    write(pkg_dir, "src/mainnet/index.ts",
          make_di_factory(slug, symbol, chain_const, factory_fn))
    write(pkg_dir, "src/index.ts",
          make_src_index(slug, chain_const, factory_fn))

    # -- Test stubs -----------------------------------------------------------
    write(pkg_dir, f"tests/{slug}-config.test.ts",              make_config_test(slug, factory_fn))
    write(pkg_dir, "tests/services/staking-service.test.ts",   make_staking_test(slug))
    write(pkg_dir, "tests/services/sign-service.test.ts",      make_sign_test(chain_const))

    # -- Example --------------------------------------------------------------
    examples_dir = ROOT / "examples"
    examples_dir.mkdir(exist_ok=True)
    example_path = examples_dir / f"{slug}-sample.ts"
    example_path.write_text(make_example(slug, symbol, chain_const, factory_fn), encoding="utf-8")
    print(f"  created  examples/{slug}-sample.ts")

    # -- Patch root files -----------------------------------------------------
    patch_eslint(ROOT, slug)
    patch_root_package_json(ROOT, slug)

    # -- Done -----------------------------------------------------------------
    print(f"""
✅  packages/{slug} scaffolded successfully.

Next steps:
  1. npm install
  2. Fill in the TODOs in packages/{slug}/src/mainnet/services/
  3. Update packages/{slug}/src/chain/index.ts (chainId, decimals, ecosystem)
  4. Add @guardian/{slug} to the packages table in README.md
  5. npm run typecheck -w packages/{slug}
  6. npm test -w packages/{slug}

Full contributor guide: docs/adding-a-chain.md
""")


if __name__ == "__main__":
    main()
