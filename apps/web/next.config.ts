import type { NextConfig } from 'next';

const apiUrl = process.env.API_URL ?? process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  transpilePackages: ['@vencore/types', '@vencore/api-client'],
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
