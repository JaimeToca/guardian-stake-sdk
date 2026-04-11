import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  noExternal: ["@guardian-sdk/sdk"],
  external: ["@cardano-sdk/core", "@cardano-sdk/crypto"],
});
