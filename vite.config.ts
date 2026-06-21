import { vitePlugin as remix } from "@remix-run/dev";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    remix({
      ignoredRouteFiles: ["**/*.css"],
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
        v3_singleFetch: false,
      },
    }),
  ],
  optimizeDeps: {
    include: ["@shopify/app-bridge-react"],
  },
  build: {
    assetsInlineLimit: 0,
  },
  server: {
    port: 3000,
  },
});
