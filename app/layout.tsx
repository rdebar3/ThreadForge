import type { Metadata } from 'next'
import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'

export const metadata: Metadata = {
  title: 'ThreadForge - Turn Any Topic Into Viral X Threads',
  description: 'Generate high-quality, ready-to-post Twitter/X threads in seconds. Free tier: 3 generations/day. Pro: $9/mo for unlimited.',
  icons: {
    icon: '/favicon.ico',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

  // Development safety check: warn if production Clerk keys are used on localhost
  const isDev = process.env.NODE_ENV === 'development'
  const isProdClerkKey = !!publishableKey && publishableKey.startsWith('pk_live_')

  return (
    <ClerkProvider publishableKey={publishableKey}>
      <html lang="en" className="dark">
        <body className="bg-zinc-950 text-zinc-100 antialiased" suppressHydrationWarning>
          {isDev && isProdClerkKey && (
            <div className="fixed top-0 left-0 right-0 z-[100] bg-red-600 text-white text-sm py-2 px-4 text-center font-medium">
              ⚠️ Clerk Production keys detected in local development. 
              Use <strong>pk_test_</strong> / <strong>sk_test_</strong> keys in .env.local only. 
              Production keys are restricted to threadforge.space.
            </div>
          )}
          {children}
        </body>
      </html>
    </ClerkProvider>
  )
}
