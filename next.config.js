/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['better-sqlite3'],
  experimental: {
    serverActions: { bodySizeLimit: '25mb' },
  },
};
module.exports = nextConfig;
