import { defineConfig } from "vitest/config";
import { resolve } from "path";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./test-setup.ts"],
    include: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
    },
  },
});
