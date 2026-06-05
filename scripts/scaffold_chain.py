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


def make_chain_name(slug: str) -> str:
    """tron → tronMainnet, bnb-smart-chain → bnbSmartChainMainnet"""
    return kebab_to_camel(slug) + "Mainnet"


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
        "name": f"@guardian-sdk/{slug}",
        "version": "0.1.0",
        "description": f"Guardian SDK for {symbol}",
        "main": "./dist/index.js",
        "module": "./dist/index.mjs",
        "types": "./dist/index.d.ts",
        "exports": {
            ".": {
                "types": "./dist/index.d.ts",
                "import": "./dist/index.mjs",
                "require": "./dist/index.js",
            }
        },
        "sideEffects": False,
        "files": ["dist"],
        "publishConfig": {"access": "public"},
        "scripts": {
            "build": "tsup",
            "typecheck": "tsc --noEmit",
            "test": "vitest run",
            "test:watch": "vitest",
        },
        "peerDependencies": {
            "@guardian-sdk/sdk": "workspace:^",
        },
        "devDependencies": {
            "@guardian-sdk/sdk": "workspace:^",
            "tsup": "^8.5.1",
            "vitest": "^4.1.3",
        },
        "engines": {"node": ">=22"},
        "keywords": [slug, "staking", "native-staking", "web3", "blockchain", "sdk", "guardian", "guardian-sdk"],
        "license": "MIT",
    }
    if not no_viem:
        pkg["peerDependencies"]["viem"] = "2"
        pkg["devDependencies"]["viem"] = "^2.48.8"

    return json.dumps(pkg, indent=2)


def make_tsconfig() -> str:
    return """{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist/cjs"
  },
  "exclude": ["node_modules", "dist", "tests", "vitest.config.ts", "tsup.config.ts"]
}
"""


def make_tsup_config(no_viem: bool) -> str:
    external = ["@guardian-sdk/sdk"]
    if not no_viem:
        external.insert(0, "viem")
    external_str = ", ".join(f'"{e}"' for e in external)
    return f"""import {{ defineConfig }} from "tsup";

export default defineConfig({{
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  external: [{external_str}],
}});
"""


def make_tsconfig_test() -> str:
    return """{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "paths": {
      "@guardian-sdk/sdk": ["../sdk/src/index.ts"],
      "@guardian-sdk/sdk/testing": ["../sdk/src/testing/index.ts"]
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
      "@guardian-sdk/sdk": resolve(__dirname, "../sdk/src/index.ts"),
      "@guardian-sdk/sdk/testing": resolve(__dirname, "../sdk/src/testing/index.ts"),
    },
  },
});
"""


def make_chain_index(slug: str, symbol: str, numeric_chain_id: str, explorer: str, chain_name: str) -> str:
    return f"""import type {{ GuardianChain }} from "@guardian-sdk/sdk";

/** {symbol} mainnet configuration. */
export const {chain_name}: GuardianChain = {{
  id: "{slug}-mainnet",
  type: "Smartchain", // TODO: adjust if not EVM — use "Cardano" for UTXO-based chains
  symbol: "{symbol}",
  decimals: 18, // TODO: confirm native token decimals
  ecosystem: "Ethereum", // TODO: adjust if not EVM — use "Cardano" for Cardano ecosystem
  chainId: "{numeric_chain_id}",
  explorer: "{explorer}",
}};

/**
 * Registry of all chains supported by `@guardian-sdk/{slug}`.
 *
 * @example
 * ```typescript
 * import {{ chains }} from "@guardian-sdk/{slug}";
 * sdk.getValidators(chains.{chain_name});
 * ```
 */
export const chains = {{
  {chain_name},
}} as const;

/** All chains supported by `@guardian-sdk/{slug}`. */
export const SUPPORTED_CHAINS: GuardianChain[] = Object.values(chains);

/** Retrieves a supported chain by its `id` string. */
export const getChainById = (id: string): GuardianChain | undefined =>
  Object.values(chains).find((chain) => chain.id === id);

/** Returns true if the given chain is in the supported chains list. */
export const isSupportedChain = (chain: GuardianChain): boolean =>
  Object.values(chains).some(
    (supported) => supported.id === chain.id && supported.chainId === chain.chainId
  );
"""


def make_staking_service(slug: str) -> str:
    return f"""import type {{
  CacheContract,
  Delegations,
  GetValidatorsParams,
  Logger,
  StakingServiceContract,
  ValidatorsPage,
}} from "@guardian-sdk/sdk";
import {{ NoopLogger, validatePageParams }} from "@guardian-sdk/sdk";

// TODO: import your RPC client contract types

const DEFAULT_PAGE_SIZE = 20;

export function createStakingService(
  cache: CacheContract<string, ValidatorsPage>,
  // TODO: inject RPC clients
  logger: Logger = new NoopLogger()
): StakingServiceContract {{
  return {{
    async getValidators(params: GetValidatorsParams = {{}}): Promise<ValidatorsPage> {{
      validatePageParams(params);
      const page = params.page ?? 1;
      const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;

      const cacheKey = `{slug}-validators-${{page}}-${{pageSize}}`;
      const cached = cache.get(cacheKey);
      if (cached) {{
        logger.debug("StakingService: validator page cache hit", {{ page, pageSize }});
        return cached;
      }}

      logger.debug("StakingService: validator page cache miss — fetching from RPC", {{ page, pageSize }});

      // TODO: fetch validators from chain RPC / REST API
      const result: ValidatorsPage = {{
        data: [],
        pagination: {{ page, pageSize, total: 0, totalPages: 0, hasNextPage: false }},
      }};

      cache.set(cacheKey, result);
      return result;
    }},

    async getDelegations(_address: string): Promise<Delegations> {{
      // TODO: fetch active delegations and protocol-level summary
      throw new Error("getDelegations: not yet implemented");
    }},
  }};
}}
"""


def make_balance_service() -> str:
    return """import type { Balance, BalanceServiceContract } from "@guardian-sdk/sdk";

// TODO: import your RPC client contract types

export function createBalanceService(
  // TODO: inject RPC client or staking service
): BalanceServiceContract {
  return {
    async getBalances(_address: string): Promise<Balance[]> {
      // TODO: return Available, Staked, Pending, Claimable balances
      throw new Error("getBalances: not yet implemented");
    },
  };
}
"""


def make_fee_service() -> str:
    return """import type { Fee, FeeServiceContract, Logger, Transaction } from "@guardian-sdk/sdk";
import { NoopLogger } from "@guardian-sdk/sdk";

// TODO: import your RPC client contract types

export function createFeeService(
  // TODO: inject RPC client for simulation
  logger: Logger = new NoopLogger()
): FeeServiceContract {
  return {
    async estimateFee(_transaction: Transaction): Promise<Fee> {
      // TODO: simulate the transaction and return gas/fee estimate
      throw new Error("estimateFee: not yet implemented");
    },
  };
}
"""


def make_sign_service() -> str:
    return """import type {
  BaseSignArgs,
  CompileArgs,
  Logger,
  PrehashResult,
  SignServiceContract,
} from "@guardian-sdk/sdk";
import { NoopLogger } from "@guardian-sdk/sdk";

// TODO: import your RPC client contract types

export function createSignService(
  // TODO: inject RPC client if needed for UTXO fetch / nonce
  logger: Logger = new NoopLogger()
): SignServiceContract {
  return {
    async sign(_signingArgs: BaseSignArgs): Promise<string> {
      // TODO: build + sign transaction with private key
      throw new Error("sign: not yet implemented");
    },

    async prehash(_preHashArgs: BaseSignArgs): Promise<PrehashResult> {
      // TODO: serialize unsigned transaction for external/MPC signing
      throw new Error("prehash: not yet implemented");
    },

    async compile(_compileArgs: CompileArgs): Promise<string> {
      // TODO: reassemble signed transaction from external signature
      throw new Error("compile: not yet implemented");
    },
  };
}
"""


def make_nonce_service() -> str:
    return """// getNonce — plain function, fetches account sequence / nonce
// TODO: inject any RPC client dependency via a closure or by changing this to createNonceService()

export async function getNonce(_address: string): Promise<number> {
  // TODO: fetch account nonce / sequence number from chain
  throw new Error("getNonce: not yet implemented");
}
"""


def make_broadcast_service() -> str:
    return """import type { Logger } from "@guardian-sdk/sdk";
import { NoopLogger } from "@guardian-sdk/sdk";

// broadcast — plain function, submits a signed raw transaction
// TODO: inject any RPC client dependency via a closure or by changing this to createBroadcastService()

export async function broadcast(
  rawTx: string,
  // TODO: inject RPC client / logger
  logger: Logger = new NoopLogger()
): Promise<string> {
  // TODO: submit rawTx to the node and return the transaction hash
  throw new Error("broadcast: not yet implemented");
}
"""


def make_di_factory(slug: str, symbol: str, chain_name: str, factory_fn: str) -> str:
    pkg = f"@guardian-sdk/{slug}"
    return f"""import type {{ GuardianServiceContract, Logger }} from "@guardian-sdk/sdk";
import {{ createInMemoryCache, NoopLogger, validateRpcUrl }} from "@guardian-sdk/sdk";
import type {{ ValidatorsPage }} from "@guardian-sdk/sdk";
import {{ {chain_name} }} from "../chain";
import {{ createStakingService }} from "./services/staking-service";
import {{ createBalanceService }} from "./services/balance-service";
import {{ createFeeService }} from "./services/fee-service";
import {{ createSignService }} from "./services/sign-service";
import {{ getNonce }} from "./services/nonce-service";
import {{ broadcast }} from "./services/broadcast-service";

/**
 * Creates a GuardianServiceContract for {symbol}.
 * Pass the result directly to the `GuardianSDK` constructor.
 *
 * @example
 * ```typescript
 * import {{ GuardianSDK }} from "@guardian-sdk/sdk";
 * import {{ {factory_fn}, chains }} from "{pkg}";
 *
 * const sdk = new GuardianSDK([
 *   {factory_fn}({{ rpcUrl: "https://<rpc-endpoint>" }}),
 * ]);
 *
 * const validators = await sdk.getValidators(chains.{chain_name});
 * ```
 */
export function {factory_fn}(config: {{ rpcUrl: string; logger?: Logger }}): GuardianServiceContract {{
  validateRpcUrl(config.rpcUrl);
  const logger = config.logger ?? new NoopLogger();

  // TODO: create your chain-specific RPC client(s) here, e.g.:
  // const client = createPublicClient({{ transport: http(config.rpcUrl) }});

  const cache = createInMemoryCache<string, ValidatorsPage>();
  const staking = createStakingService(cache, logger);
  const balance = createBalanceService();
  const sign = createSignService(logger);
  const fee = createFeeService(logger);

  return {{
    getChainInfo: () => {chain_name},
    getValidators: (params) => staking.getValidators(params),
    getDelegations: (address) => staking.getDelegations(address),
    getBalances: (address) => balance.getBalances(address),
    getNonce: (address) => getNonce(address),
    estimateFee: (tx) => fee.estimateFee(tx),
    sign: (args) => sign.sign(args),
    prehash: (args) => sign.prehash(args),
    compile: (args) => sign.compile(args),
    broadcast: (rawTx) => broadcast(rawTx, logger),
  }};
}}
"""


def make_src_index(slug: str, factory_fn: str) -> str:
    return f"""// Re-export everything from @guardian-sdk/sdk so consumers need only one import
export * from "@guardian-sdk/sdk";

// @guardian-sdk/{slug} public API
export {{ {factory_fn} }} from "./{slug}-chain";
export {{ chains, SUPPORTED_CHAINS, getChainById, isSupportedChain }} from "./chain";
"""


def make_config_test(slug: str, factory_fn: str) -> str:
    return f"""import {{ describe, it, expect }} from "vitest";
import {{ ConfigError }} from "@guardian-sdk/sdk";
import {{ {factory_fn} }} from "../src/{slug}-chain";

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
import {{ createStakingService }} from "../../src/{slug}-chain/services/staking-service";
import {{ createInMemoryCache }} from "@guardian-sdk/sdk";
import type {{ ValidatorsPage }} from "@guardian-sdk/sdk";

describe("createStakingService", () => {{
  describe("getValidators()", () => {{
    it("returns cached result on second call", async () => {{
      const cache = createInMemoryCache<string, ValidatorsPage>();
      const service = createStakingService(cache);

      const mockPage: ValidatorsPage = {{
        data: [],
        pagination: {{ page: 1, pageSize: 20, total: 0, totalPages: 0, hasNextPage: false }},
      }};
      cache.set("{slug}-validators-1-20", mockPage);

      const result = await service.getValidators({{ page: 1, pageSize: 20 }});
      expect(result).toBe(mockPage);
    }});

    // TODO: add tests for RPC fetch, APY mapping, pagination, etc.
  }});
}});
"""


def make_sign_test(slug: str, chain_name: str) -> str:
    return f"""import {{ describe, it }} from "vitest";
import {{ createSignService }} from "../../src/{slug}-chain/services/sign-service";
import {{ chains }} from "../../src/chain";

describe("createSignService", () => {{
  const _service = createSignService();
  const _chain = chains.{chain_name};

  describe("sign", () => {{
    it.todo("signs a Delegate transaction with a private key");
    it.todo("signs an Undelegate transaction with a private key");
  }});

  describe("prehash", () => {{
    it.todo("returns a serialized transaction and the original sign args");
  }});

  describe("compile", () => {{
    it.todo("assembles a signed transaction from an external signature");
  }});
}});
"""


def make_example(slug: str, symbol: str, chain_name: str, factory_fn: str) -> str:
    pkg = f"@guardian-sdk/{slug}"
    return f"""/**
 * {symbol} staking — quick-start sample
 * Run: pnpm tsx examples/{slug}-sample.ts
 */
import {{ GuardianSDK }} from "@guardian-sdk/sdk";
import {{ {factory_fn}, chains }} from "{pkg}";

const sdk = new GuardianSDK([
  {factory_fn}({{ rpcUrl: "https://<rpc-endpoint>" /* TODO: replace */ }}),
]);

// --- Validators --------------------------------------------------------------
const {{ data: validators, pagination }} = await sdk.getValidators(chains.{chain_name});
console.log(`validators (${{pagination.total ?? "?"}})`, validators.slice(0, 3));

// --- Delegations -------------------------------------------------------------
const ADDRESS = "<your-address>"; // TODO: replace
const {{ delegations, stakingSummary }} = await sdk.getDelegations(chains.{chain_name}, ADDRESS);
console.log("stakingSummary:", stakingSummary);
console.log(`delegations (${{delegations.length}}):`, delegations);

// --- Balances ----------------------------------------------------------------
const balances = await sdk.getBalances(chains.{chain_name}, ADDRESS);
for (const b of balances) {{
  console.log(b.type, Number(b.amount) / 10 ** {chain_name.replace("Mainnet", "")}.decimals);  // TODO: verify decimals
}}
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
    new_entry = f"pnpm --filter @guardian-sdk/{slug} run build"

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
    chain_name = make_chain_name(slug)
    factory_fn = kebab_to_camel(slug)
    no_viem = args.no_viem

    pkg_dir = ROOT / "packages" / slug

    if pkg_dir.exists():
        print(f"\n❌  packages/{slug} already exists. Aborting to avoid overwriting work.\n")
        sys.exit(1)

    print(f"\nScaffolding @guardian-sdk/{slug} ...\n")

    # -- Config files ---------------------------------------------------------
    write(pkg_dir, "package.json",       make_package_json(slug, symbol, no_viem))
    write(pkg_dir, "tsconfig.json",      make_tsconfig())
    write(pkg_dir, "tsconfig.test.json", make_tsconfig_test())
    write(pkg_dir, "tsup.config.ts",     make_tsup_config(no_viem))
    write(pkg_dir, "vitest.config.ts",   make_vitest_config())

    # -- Source files ---------------------------------------------------------
    write(pkg_dir, "src/chain/index.ts",
          make_chain_index(slug, symbol, numeric_chain_id, explorer, chain_name))
    write(pkg_dir, f"src/{slug}-chain/services/staking-service.ts",  make_staking_service(slug))
    write(pkg_dir, f"src/{slug}-chain/services/balance-service.ts",  make_balance_service())
    write(pkg_dir, f"src/{slug}-chain/services/fee-service.ts",      make_fee_service())
    write(pkg_dir, f"src/{slug}-chain/services/sign-service.ts",     make_sign_service())
    write(pkg_dir, f"src/{slug}-chain/services/nonce-service.ts",    make_nonce_service())
    write(pkg_dir, f"src/{slug}-chain/services/broadcast-service.ts", make_broadcast_service())
    write(pkg_dir, f"src/{slug}-chain/index.ts",
          make_di_factory(slug, symbol, chain_name, factory_fn))
    write(pkg_dir, "src/index.ts",
          make_src_index(slug, factory_fn))

    # -- Test stubs -----------------------------------------------------------
    write(pkg_dir, f"tests/{slug}-config.test.ts",
          make_config_test(slug, factory_fn))
    write(pkg_dir, "tests/services/staking-service.test.ts",
          make_staking_test(slug))
    write(pkg_dir, "tests/services/sign-service.test.ts",
          make_sign_test(slug, chain_name))

    # -- Example --------------------------------------------------------------
    examples_dir = ROOT / "examples"
    examples_dir.mkdir(exist_ok=True)
    example_path = examples_dir / f"{slug}-sample.ts"
    example_path.write_text(make_example(slug, symbol, chain_name, factory_fn), encoding="utf-8")
    print(f"  created  examples/{slug}-sample.ts")

    # -- Patch root files -----------------------------------------------------
    patch_eslint(ROOT, slug)
    patch_root_package_json(ROOT, slug)

    # -- Done -----------------------------------------------------------------
    print(f"""
✅  packages/{slug} scaffolded successfully.

Next steps:
  1.  pnpm install
  2.  Fill in the TODOs in packages/{slug}/src/{slug}-chain/services/
  3.  Update packages/{slug}/src/chain/index.ts (type, ecosystem, chainId, decimals)
  4.  Create .claude/rules/{slug}.md with chain-specific architecture notes
      (globs: packages/{slug}/**)
  5.  Add @guardian-sdk/{slug} to the packages table in README.md
  6.  pnpm --filter @guardian-sdk/{slug} run typecheck
  7.  pnpm --filter @guardian-sdk/{slug} run test

Full contributor guide: docs/adding-a-chain.md
""")


if __name__ == "__main__":
    main()
