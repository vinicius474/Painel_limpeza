import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  server: {
    host: "127.0.0.1", // Apenas localhost em dev
    port: 3000,
    // Proxy: encaminha todas as rotas do Express em dev
    // xfwd: true — adiciona X-Forwarded-For com o IP real do cliente
    proxy: {
      "/api":    { target: "http://127.0.0.1:3001", changeOrigin: true, xfwd: true },
      "/auth":   { target: "http://127.0.0.1:3001", changeOrigin: true, xfwd: true },
      "/admin":  { target: "http://127.0.0.1:3001", changeOrigin: true, xfwd: true },
      "/health": { target: "http://127.0.0.1:3001", changeOrigin: true, xfwd: true },
    },
  },

  preview: {
    host: "127.0.0.1",
    port: 3000,
  },

  build: {
    outDir: "dist",
    sourcemap: false,      // Nunca expor source maps em produção
    rollupOptions: {
      output: {
        // Nomes com hash para cache busting
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },
    },
  },
});
