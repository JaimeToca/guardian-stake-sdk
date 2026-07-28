import { createRequire } from "node:module";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

const require = createRequire(import.meta.url);

// The smoke test's whole point: prove the @guardian-sdk chain packages bundle AND
// run in a browser. BSC/Solana/Tron need only a Buffer global, but Cardano's crypto
// stack (pbkdf2 → hash-base → readable-stream) also reaches for `process`, `stream`,
// and `util`. This is the fuller polyfill set a wallet frontend needs to ship Cardano.
//
// pnpm caveat: the polyfills plugin rewrites globals to `vite-plugin-node-polyfills/shims/*`
// imports, which rollup can't resolve from inside a dependency's dir (pnpm doesn't hoist
// the plugin). Aliasing the three shim subpaths to absolute paths fixes `vite build`.
const shim = (name: string) => require.resolve(`vite-plugin-node-polyfills/shims/${name}`);

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: ["buffer", "process", "stream", "util", "events", "string_decoder"],
      globals: { Buffer: true, global: true, process: true },
      protocolImports: true,
    }),
  ],
  resolve: {
    alias: {
      "vite-plugin-node-polyfills/shims/buffer": shim("buffer"),
      "vite-plugin-node-polyfills/shims/global": shim("global"),
      "vite-plugin-node-polyfills/shims/process": shim("process"),
    },
  },
  optimizeDeps: {
    include: ["@guardian-sdk/cardano", "@guardian-sdk/tron", "@guardian-sdk/solana", "@guardian-sdk/bsc"],
  },
});
