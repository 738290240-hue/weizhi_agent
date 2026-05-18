import { resolve } from "path";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  base: "./",
  plugins: [vue()],
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
  server: {
    port: 5181,
    proxy: {
      "/api": { target: "http://localhost:3007", changeOrigin: true },
    },
  },
});
