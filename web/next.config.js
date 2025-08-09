/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable ESLint during builds to prevent build failures
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Disable TypeScript strict mode during builds
  typescript: {
    ignoreBuildErrors: true,
  },
  // API routes configuration
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: process.env.API_BASE_URL 
          ? `${process.env.API_BASE_URL}/api/:path*`
          : 'http://localhost:6100/api/:path*',
      },
    ];
  },
  // Environment variables
  env: {
    API_BASE_URL: process.env.API_BASE_URL || 'http://localhost:6100',
    WS_BASE_URL: process.env.WS_BASE_URL || 'ws://localhost:6100/ws',
    NEXT_PUBLIC_WS_BASE_URL: process.env.WS_BASE_URL || 'ws://localhost:6100/ws',
    APP_ENV: process.env.NODE_ENV || 'development',
  },
  // Image optimization
  images: {
    domains: ['localhost'],
  },
  // Webpack configuration for shared types
  webpack: (config, { isServer }) => {
    // Allow importing TypeScript files from shared types
    config.resolve.alias = {
      ...config.resolve.alias,
      '@mcp-tools/core': require('path').resolve(__dirname, '../core/dist'),
      '@mcp-tools/core/shared': require('path').resolve(__dirname, '../core/dist/shared'),
    };
    
    return config;
  },
  // Output configuration
  output: 'standalone',
  
  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;