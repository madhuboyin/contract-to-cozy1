import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Contract to Cozy',
  description: 'Transform Contracts into Cozy Homes',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
