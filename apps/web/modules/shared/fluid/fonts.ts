import { Space_Grotesk, Inter } from 'next/font/google';
import localFont from 'next/font/local';

export const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--fluid-font-display',
});

export const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--fluid-font-body',
});

// Material Symbols Outlined is an icon font; next/font/google does not expose it,
// so it is self-hosted. Download the variable woff2 once into ./assets and reference it.
export const materialSymbols = localFont({
  src: './assets/material-symbols-outlined.woff2',
  variable: '--fluid-font-icon',
  display: 'block',
});
