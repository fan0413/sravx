import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "node:path";

export default defineConfig({
  base: "./",
  plugins: [vue()],
  server: {
    proxy: { '/api': { target: 'https://api.sravxpet.com', changeOrigin: true } }
  },
  preview: {
    proxy: { '/api': { target: 'https://api.sravxpet.com', changeOrigin: true } }
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src")
    }
  }
});
