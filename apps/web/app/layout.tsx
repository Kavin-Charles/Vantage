import type { Metadata } from 'next';
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import { AuthProvider } from '@/modules/shared/lib/AuthContext';
import { ThemeProvider } from '@/modules/shared/contexts/ThemeContext';
import { Providers } from '@/modules/shared/components/Providers';
import './globals.css';

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-sans',
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
});

async function getBranding(): Promise<{ name: string | null; tagline: string | null; faviconUrl: string | null }> {
  const apiUrl = process.env['API_URL'] ?? process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';
  try {
    const res = await fetch(`${apiUrl}/api/config`, { cache: 'no-store', signal: AbortSignal.timeout(3000) });
    const json = await res.json() as { data?: { app?: { name?: string; tagline?: string | null; faviconUrl?: string | null } } };
    const app = json.data?.app;
    return { name: app?.name ?? null, tagline: app?.tagline ?? null, faviconUrl: app?.faviconUrl ?? null };
  } catch {
    return { name: null, tagline: null, faviconUrl: null };
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const { name, tagline, faviconUrl } = await getBranding();
  const isBranded = !!name && name !== 'Vencore';

  return {
    title: isBranded ? name! : 'Vencore — Build, sell, and ship in one place',
    description: isBranded
      ? (tagline ?? 'One platform to run your business.')
      : 'Build, sell, and ship — one place. CRM, infra monitoring, and team tools for developer-led teams.',
    ...(faviconUrl ? { icons: { icon: faviconUrl } } : {}),
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${ibmPlexSans.variable} ${ibmPlexMono.variable}`}
      suppressHydrationWarning
    >
      <body suppressHydrationWarning>
        <div id="app-root">
          <Providers>
            <AuthProvider>
              <ThemeProvider>{children}</ThemeProvider>
            </AuthProvider>
          </Providers>
        </div>
      </body>
    </html>
  );
}
