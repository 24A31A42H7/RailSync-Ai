import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  test: {
    environment: "jsdom",
    globals: true,

    // Do NOT run RailTracker tests
    exclude: [
      "node_modules/**",
      "dist/**",
      "coverage/**",
      "src/components/RailTracker.test.jsx",
    ],

    coverage: {
      provider: "v8",

      reporter: ["text", "html", "lcov"],

      reportsDirectory: "./coverage",

      // Do NOT calculate coverage for RailTracker
      exclude: [
        "src/components/RailTracker.jsx",
        "src/components/RailTracker.test.jsx",
        "node_modules/**",
        "dist/**",
        "coverage/**",
        "**/*.test.js",
        "**/*.test.jsx",
      ],
    },
  },
});

