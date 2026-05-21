import type { NextConfig } from 'next';

const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

const nextConfig: NextConfig = {
  transpilePackages: ['@vantage/types', '@vantage/api-client'],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
