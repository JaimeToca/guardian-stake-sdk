import { useState } from "react";

// The point of this file: import every chain package the way a wallet frontend would,
// then exercise the code path most likely to break in a browser. If the module graph
// loads and these run, the SDK is browser-ready (modulo CORS on real RPC endpoints).

type Check = { name: string; run: () => Promise<string> };

// A valid CIP-1852 root key (96 bytes / 192 hex) precomputed from dummy entropy.
const CARDANO_ROOT_KEY =
  "c06a3f6b48d90f0517dbf244da40cc25feaebc91bee5b92e2d9301db51520f45b3469692e2bc05cf27f7e4b749581b3719a37dc3045d69da8c0d826c88b80f5745a302ecb459a48b23bdf5ca1f7c5ff6a46c4fe17c30751fa49f08f4fd564a7a";

const checks: Check[] = [
  {
    name: "BSC — import + construct factory (viem)",
    run: async () => {
      const { bsc, chains, GuardianSDK } = await import("@guardian-sdk/bsc");
      const sdk = new GuardianSDK([bsc({ rpcUrl: "https://bsc-dataseed.bnbchain.org" })]);
      return `constructed; chain id = ${chains.bscMainnet.id}, sdk methods present = ${typeof sdk.getValidators === "function"}`;
    },
  },
  {
    name: "Solana — import + construct factory (@solana/kit)",
    run: async () => {
      const { solana, chains, GuardianSDK, LAMPORTS_PER_SOL } = await import("@guardian-sdk/solana");
      const sdk = new GuardianSDK([solana({ rpcUrl: "https://api.mainnet-beta.solana.com" })]);
      return `constructed; chain id = ${chains.solanaMainnet.id}, LAMPORTS_PER_SOL = ${LAMPORTS_PER_SOL}, sdk ok = ${typeof sdk.getBalances === "function"}`;
    },
  },
  {
    name: "Tron — import + construct factory (tronweb, needs Buffer)",
    run: async () => {
      const { tron, chains, GuardianSDK } = await import("@guardian-sdk/tron");
      const sdk = new GuardianSDK([tron({ rpcUrl: "https://api.trongrid.io" })]);
      return `constructed; chain id = ${chains.tronMainnet.id}, sdk ok = ${typeof sdk.getValidators === "function"}`;
    },
  },
  {
    name: "Cardano — libsodium WASM ready() + Bip32 key derivation",
    run: async () => {
      // The real browser risk: does the libsodium WASM initialize, and does Buffer work?
      const { ready } = await import("@cardano-sdk/crypto");
      await ready(); // MUST await before any crypto — the consumer gotcha
      const { deriveCardanoKeys, cardano, chains, GuardianSDK } = await import(
        "@guardian-sdk/cardano"
      );
      const keys = deriveCardanoKeys(CARDANO_ROOT_KEY);
      const sdk = new GuardianSDK([cardano({ apiKey: "smoke-test-no-network" })]);
      return `libsodium ready; derived payment key = ${keys.paymentPrivateKey.slice(0, 12)}…, chain = ${chains.cardanoMainnet.id}, sdk ok = ${typeof sdk.getValidators === "function"}`;
    },
  },
];

type Result = { status: "idle" | "running" | "pass" | "fail"; detail?: string };

export function App() {
  const [results, setResults] = useState<Record<string, Result>>(
    Object.fromEntries(checks.map((c) => [c.name, { status: "idle" }]))
  );

  async function runOne(check: Check) {
    setResults((r) => ({ ...r, [check.name]: { status: "running" } }));
    try {
      const detail = await check.run();
      setResults((r) => ({ ...r, [check.name]: { status: "pass", detail } }));
    } catch (err) {
      setResults((r) => ({
        ...r,
        [check.name]: { status: "fail", detail: err instanceof Error ? err.stack ?? err.message : String(err) },
      }));
    }
  }

  async function runAll() {
    for (const c of checks) await runOne(c);
  }

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 820, margin: "40px auto", padding: 16 }}>
      <h1>Guardian SDK — Browser Smoke Test</h1>
      <p style={{ color: "#555" }}>
        Each card imports a chain package and runs its most browser-fragile path. Green = it bundles
        and loads in the browser. (Live RPC calls aren't made here — this isolates the bundling/WASM
        question from CORS.)
      </p>
      <button onClick={runAll} style={{ padding: "8px 16px", fontSize: 16, marginBottom: 16 }}>
        Run all
      </button>
      {checks.map((c) => {
        const r = results[c.name];
        const color =
          r.status === "pass" ? "#0a7" : r.status === "fail" ? "#c33" : r.status === "running" ? "#a70" : "#999";
        return (
          <div key={c.name} style={{ border: `1px solid ${color}`, borderRadius: 8, padding: 12, marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong>{c.name}</strong>
              <span style={{ color, fontWeight: 600 }}>{r.status.toUpperCase()}</span>
            </div>
            <button onClick={() => runOne(c)} style={{ marginTop: 8 }}>
              Run
            </button>
            {r.detail && (
              <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, color: r.status === "fail" ? "#c33" : "#333", marginTop: 8 }}>
                {r.detail}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
}
