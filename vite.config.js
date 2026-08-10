import { defineConfig } from "vite";

export default defineConfig({
  base: "/strength-split/",
  test: {
    environment: "node",
    include: ["tests/**/*.test.js"]
  }
});
