import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  external: ["@cardano-sdk/core", "@cardano-sdk/crypto", "@cardano-sdk/util", "@guardian-sdk/sdk"],
});
