import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ThreadForge - Turn Any Topic Into Viral X Threads',
  description: 'Generate high-quality, ready-to-post Twitter/X threads in seconds. $9 one-time for unlimited access.',
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
    <html lang="en" className="dark">
      <body className="bg-zinc-950 text-zinc-100 antialiased">
        {children}
      </body>
    </html>
  )
}
