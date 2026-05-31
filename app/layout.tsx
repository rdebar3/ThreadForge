import type { Metadata } from 'next'
import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'

export const metadata: Metadata = {
  title: 'ThreadForge - Turn Any Topic Into Viral X Threads',
  description: 'Generate high-quality, ready-to-post Twitter/X threads in seconds. Currently free while we test the tool.',
  icons: {
    icon: '/favicon.ico',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClerkProvider>
      <html lang="en" className="dark">
        <body className="bg-zinc-950 text-zinc-100 antialiased" suppressHydrationWarning>
          {children}
        </body>
      </html>
    </ClerkProvider>
  )
}
