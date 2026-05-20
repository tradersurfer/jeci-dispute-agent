import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Allow large file uploads (PDF credit reports up to 10MB)
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  // Netlify plugin handles output mode automatically
};

export default nextConfig;
