/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['better-sqlite3', 'pdfjs-dist'],
  // Dev-only: allow the OrbStack/network IP origin to fetch /_next/* internals
  // (RSC payloads, HMR). Without this, client-side navigation from the IP origin
  // can fail with a generic client-side exception. Ignored in production.
  allowedDevOrigins: ['192.168.139.234'],
  experimental: {
    serverActions: { bodySizeLimit: '30mb' },
  },
};
module.exports = nextConfig;
