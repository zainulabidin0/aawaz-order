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
  ssr: {
    // Bundle Shopify packages into the server build so Vercel's
    // serverless function doesn't need to resolve them from node_modules.
    noExternal: [
      "@shopify/shopify-app-remix",
      "@shopify/shopify-app-session-storage-prisma",
      /^@shopify\//,
    ],
  },
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
