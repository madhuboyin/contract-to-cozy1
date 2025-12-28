// apps/frontend/src/app/layout.tsx

import type { Metadata } from 'next';
import { Inter, Poppins } from 'next/font/google';
import { AuthProvider } from '@/lib/auth/AuthContext';
import { Toaster } from '@/components/ui/toaster';
import { QueryProvider } from '@/lib/providers/QueryProvider'; // FIX 1: Import the Query Provider
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

export const metadata: Metadata = {
  title: 'Contract to Cozy - Home Service Marketplace',
  description: 'Connect with trusted service providers for your home',
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${poppins.variable} ${inter.className}`}>
        {/* FIX 2: Wrap the entire application with QueryProvider */}
        <QueryProvider>
          <AuthProvider>
            {children}
            <Toaster />
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}