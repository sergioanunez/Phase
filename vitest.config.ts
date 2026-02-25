import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  test: {
    include: ["**/*.test.ts", "**/*.spec.ts"],
    globals: true,
    environment: "jsdom",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
})
