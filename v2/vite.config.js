import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const base = process.env.VITE_BASE || "/ObentoPet/";

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "ObentōPet · Gestão",
        short_name: "ObentōPet",
        description: "Entregas, clientes, produtos e produção da ObentōPet",
        lang: "pt-BR",
        start_url: base,
        scope: base,
        display: "standalone",
        orientation: "portrait",
        background_color: "#FDF8F2",
        theme_color: "#3E332A",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Dados sensíveis NUNCA ficam em cache offline: só o "casco" do app.
        navigateFallback: "index.html",
        globPatterns: ["**/*.{js,css,html,svg,png}"],
        runtimeCaching: [],
      },
    }),
  ],
  build: { chunkSizeWarningLimit: 900 },
});
