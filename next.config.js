/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['better-sqlite3', 'pdfjs-dist'],
  // Middleware buffers the full request body; default cap is 10MB.
  // Keep this >= serverActions.bodySizeLimit and <= nginx's client_max_body_size.
  middlewareClientMaxBodySize: '30mb',
  experimental: {
    serverActions: { bodySizeLimit: '30mb' },
  },
};
module.exports = nextConfig;
