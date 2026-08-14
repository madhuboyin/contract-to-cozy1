// apps/frontend/src/app/layout.tsx

import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { Providers } from './providers';
import '@fontsource/inter/latin-300.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/poppins/latin-400.css';
import '@fontsource/poppins/latin-500.css';
import '@fontsource/poppins/latin-600.css';
import '@fontsource/poppins/latin-700.css';
import '@fontsource/fraunces/latin-600.css';
import '@fontsource/fraunces/latin-700.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'ContractToCozy - Homeowner Intelligence',
  description: 'Your complete property management companion',
  applicationName: 'ContractToCozy',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://contracttocozy.com'),
  referrer: 'strict-origin-when-cross-origin',
  robots: {
    index: true,
    follow: true,
    noarchive: true,
  },
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
    title: 'ContractToCozy',
    description: 'Your complete property management companion',
    siteName: 'ContractToCozy',
  },
  twitter: {
    card: 'summary',
    title: 'ContractToCozy',
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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Nonce is injected by middleware.ts for every document request.
  // Pass it to any next/script <Script nonce={nonce}> tags added in the future.
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html lang="en">
      <body>
        <Providers nonce={nonce}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
