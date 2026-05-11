import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  // COOP/COEP headers are only applied in dev mode (next dev).
  // In the Tauri production build (static export), the native webview
  // already provides cross-origin isolation for SharedArrayBuffer.
  // See: https://nextjs.org/docs/messages/export-no-custom-routes
  ...(process.env.NODE_ENV === 'development' && {
    async headers() {
      return [
        {
          source: '/(.*)',
          headers: [
            { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
            { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
          ],
        },
      ];
    },
  }),
};

export default nextConfig;
