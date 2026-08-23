/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: { unoptimized: true },
  basePath: '/vhts',
  trailingSlash: true,
  webpack: (config) => {
    // @supabase/realtime-js uses dynamic `require()` for its WebSocket
    // transport, which triggers a "Critical dependency: the request of a
    // dependency is an expression" build warning. We don't use realtime
    // subscriptions, so tell Webpack to ignore that module at build time.
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      { module: /node_modules\/@supabase\/realtime-js/ },
    ];
    return config;
  },
};

module.exports = nextConfig;
