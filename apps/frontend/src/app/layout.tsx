// apps/frontend/src/app/layout.tsx

import type { Metadata, Viewport } from 'next';
import { Fraunces, Inter, Poppins } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';
import 'react-circular-progressbar/dist/styles.css';

// Inter for body text
const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-sans',
  display: 'swap',
});

// Poppins for headings
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

// Fraunces for score displays and premium numeric emphasis
const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-display',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Contract to Cozy - Home Service Marketplace',
  description: 'Your complete property management companion',
  applicationName: 'Contract to Cozy',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'C2C',
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: 'website',
    title: 'Contract to Cozy',
    description: 'Your complete property management companion',
    siteName: 'Contract to Cozy',
  },
  twitter: {
    card: 'summary',
    title: 'Contract to Cozy',
    description: 'Your complete property management companion',
  },
  icons: {
    icon: '/favicon.svg',
    apple: '/icons/icon-192x192.png',
  },
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
  themeColor: '#0d9488',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable} ${poppins.variable}`}>
      <body className={inter.className}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
