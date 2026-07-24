import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  external: [
    "@guardian-sdk/sdk",
    "@solana/kit",
    "@solana/sysvars",
    "@solana-program/stake",
    "@solana-program/system",
  ],
});
