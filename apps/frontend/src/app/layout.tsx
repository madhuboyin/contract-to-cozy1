// apps/frontend/src/app/layout.tsx

import type { Metadata } from 'next';
import './globals.css';
import { UserContextProvider } from '@/context/UserContext'; // Import new context
import { AuthProvider } from '@/lib/auth/AuthContext'; // Import AuthProvider

// We rely on the global CSS import for Google Fonts

export const metadata: Metadata = {
  title: 'Contract to Cozy | Signature to Sanctuary',
  description: 'Your complete companion for the home journey—simplifying the chaos of closing and mastering the art of maintenance.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {/* Wrap content with AuthProvider and UserContextProvider */}
        <AuthProvider>
          <UserContextProvider>
            {children}
          </UserContextProvider>
        </AuthProvider>
      </body>
    </html>
  );
}