/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['better-sqlite3', 'pdfjs-dist'],
  experimental: {
    serverActions: { bodySizeLimit: '30mb' },
  },
};
module.exports = nextConfig;
