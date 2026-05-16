import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@vantage/types', '@vantage/api-client'],
};

export default nextConfig;
