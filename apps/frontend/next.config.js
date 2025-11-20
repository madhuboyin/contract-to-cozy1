// apps/frontend/next.config.js

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
      },
      // ADDED: Configuration for Unsplash images using HTTPS
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        // Allows images from any path on the Unsplash CDN
        pathname: '/**', 
      },
    ],
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  },
};

module.exports = nextConfig;