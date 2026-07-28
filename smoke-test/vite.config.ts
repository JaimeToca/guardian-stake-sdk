import { createRequire } from "node:module";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

const require = createRequire(import.meta.url);
const shim = (name: string) => require.resolve(`vite-plugin-node-polyfills/shims/${name}`);

// The smoke test's whole point: prove the @guardian-sdk chain packages bundle AND
// run in a browser. BSC/Solana/Tron need only a Buffer global, but Cardano's crypto
// stack (pbkdf2 → hash-base → readable-stream) also reaches for `process`, `stream`,
// and `util`. This is the fuller polyfill set a wallet frontend needs to ship Cardano.
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    nodePolyfills({
      include: ["buffer", "process", "stream", "util", "events", "string_decoder"],
      globals: { Buffer: true, global: true, process: true },
      protocolImports: true,
    }),
  ],
  // pnpm caveat: for `vite build`, rollup can't resolve the plugin's
  // `vite-plugin-node-polyfills/shims/*` imports from inside a bundled dependency
  // (pnpm doesn't hoist the plugin), so alias them to absolute paths. This alias
  // must NOT be applied in dev — there it triggers a temporal-dead-zone init error
  // (`Cannot access '__vite__cjsImport0_...shims_buffer' before initialization`).
  resolve:
    command === "build"
      ? {
          alias: {
            "vite-plugin-node-polyfills/shims/buffer": shim("buffer"),
            "vite-plugin-node-polyfills/shims/global": shim("global"),
            "vite-plugin-node-polyfills/shims/process": shim("process"),
          },
        }
      : {},
  optimizeDeps: {
    include: ["@guardian-sdk/cardano", "@guardian-sdk/tron", "@guardian-sdk/solana", "@guardian-sdk/bsc"],
  },
}));
