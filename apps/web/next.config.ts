import { loadEnvConfig } from '@next/env';
import { resolve } from 'path';
import type { NextConfig } from 'next';

loadEnvConfig(resolve(process.cwd(), '../..'));

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
  async redirects() {
    return [
      { source: '/pipeline', destination: '/crm/pipeline', permanent: true },
      { source: '/pipeline/:path*', destination: '/crm/pipeline/:path*', permanent: true },
      { source: '/contacts', destination: '/crm/contacts', permanent: true },
      { source: '/contacts/:path*', destination: '/crm/contacts/:path*', permanent: true },
      { source: '/companies', destination: '/crm/companies', permanent: true },
      { source: '/companies/:path*', destination: '/crm/companies/:path*', permanent: true },
      { source: '/tasks', destination: '/crm/tasks', permanent: true },
      { source: '/tasks/:path*', destination: '/crm/tasks/:path*', permanent: true },
      { source: '/servers', destination: '/infra/servers', permanent: true },
      { source: '/servers/:path*', destination: '/infra/servers/:path*', permanent: true },
      { source: '/databases', destination: '/infra/databases', permanent: true },
      { source: '/databases/:path*', destination: '/infra/databases/:path*', permanent: true },
      { source: '/websites', destination: '/infra/websites', permanent: true },
      { source: '/websites/:path*', destination: '/infra/websites/:path*', permanent: true },
      { source: '/alerts', destination: '/infra/alerts', permanent: true },
      { source: '/alerts/:path*', destination: '/infra/alerts/:path*', permanent: true },
    ];
  },
};

export default nextConfig;
