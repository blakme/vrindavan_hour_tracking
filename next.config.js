/** @type {import{next}.NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: { unoptimized: true },
  basePath: '/vhts',
  trailingSlash: true,
};

module.exports = nextConfig;
