import type { Metadata } from 'next';
import { IBM_Plex_Sans, IBM_Plex_Mono, Bricolage_Grotesque } from 'next/font/google';
import { AuthProvider } from '@/modules/shared/lib/AuthContext';
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

const bricolageGrotesque = Bricolage_Grotesque({
  subsets: ['latin'],
  axes: ['opsz', 'wdth'],
  variable: '--font-display',
});

export const metadata: Metadata = {
  title: 'Vencore — Build, sell, and ship in one place',
  description: 'Build, sell, and ship — one place. CRM, infra monitoring, and team tools for developer-led teams.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${ibmPlexSans.variable} ${ibmPlexMono.variable} ${bricolageGrotesque.variable}`}
      suppressHydrationWarning
    >
      <body suppressHydrationWarning>
        <div id="app-root">
          <Providers>
            <AuthProvider>{children}</AuthProvider>
          </Providers>
        </div>
      </body>
    </html>
  );
}
