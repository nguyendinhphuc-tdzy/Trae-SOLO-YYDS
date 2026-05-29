/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    turbo: {
      resolveAlias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
  },
};

module.exports = nextConfig;
