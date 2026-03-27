import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@guardian/sdk": resolve(__dirname, "../sdk/src/index.ts"),
    },
  },
});
