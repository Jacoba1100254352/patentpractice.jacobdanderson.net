import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["src/**/*.test.{js,jsx}"],
    exclude: ["tests/sites-worker.test.mjs", "dist/**", "node_modules/**"],
  },
});
