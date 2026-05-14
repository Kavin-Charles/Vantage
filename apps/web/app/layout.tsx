import type { Metadata } from 'next';
import { DM_Sans, Instrument_Serif } from 'next/font/google';
import { AuthProvider } from '@/lib/AuthContext';
import { Providers } from '@/components/Providers';
import './globals.css';

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-dm-sans',
});

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: ['400'],
  style: ['normal', 'italic'],
  variable: '--font-instrument-serif',
});

export const metadata: Metadata = {
  title: 'Vantage — Build, sell, and ship in one place',
  description: 'Build, sell, and ship — one place. CRM, infra monitoring, and team tools for developer-led teams.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${instrumentSerif.variable}`}
      suppressHydrationWarning
    >
      <body suppressHydrationWarning>
        <AuthProvider>
          <Providers>{children}</Providers>
        </AuthProvider>
      </body>
    </html>
  );
}
