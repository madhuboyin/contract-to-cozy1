// apps/frontend/src/app/layout.tsx

'use client';

import type { Metadata } from 'next';
import { Inter, Poppins } from 'next/font/google';
import { AuthProvider } from '@/lib/auth/AuthContext';
import { Toaster } from '@/components/ui/toaster';
import { QueryProvider } from '@/lib/providers/QueryProvider';
import { NetworkStatus } from '@/components/mobile/OfflineBanner';
import { InstallPrompt } from '@/components/mobile/InstallPrompt';
import { registerServiceWorker } from '@/lib/pwa';
import { useEffect } from 'react';
import './globals.css';

// Inter for body text
const inter = Inter({ 
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-inter',
  display: 'swap',
});

// Poppins for headings
const poppins = Poppins({ 
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

// Note: metadata export doesn't work in client components
// Move this to a layout.tsx if you convert to server component
// Or add these via next/head in a ClientLayout component

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    // Register service worker for PWA
    registerServiceWorker();
  }, []);

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes, viewport-fit=cover" />
        
        {/* PWA Meta Tags */}
        <meta name="application-name" content="Contract to Cozy" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="C2C" />
        <meta name="description" content="Your complete property management companion" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#2563eb" />
        
        {/* Icons */}
        <link rel="icon" href="/favicon.svg" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <link rel="manifest" href="/manifest.json" />
        
        {/* Open Graph */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Contract to Cozy" />
        <meta property="og:description" content="Your complete property management companion" />
        <meta property="og:site_name" content="Contract to Cozy" />
        
        {/* Twitter */}
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="Contract to Cozy" />
        <meta name="twitter:description" content="Your complete property management companion" />
        
        <title>Contract to Cozy - Home Service Marketplace</title>
      </head>
      <body className={`${inter.variable} ${poppins.variable} ${inter.className}`}>
        <QueryProvider>
          <AuthProvider>
            {/* Network status indicators */}
            <NetworkStatus />
            
            {/* Main content */}
            {children}
            
            {/* Install prompt for PWA */}
            <InstallPrompt />
            
            {/* Toast notifications */}
            <Toaster />
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
