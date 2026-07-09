import type { Metadata } from 'next'
import './globals.css'
import { Sidebar } from './_components/sidebar'

export const metadata: Metadata = {
  title: 'tasky',
  description: 'The graph-native Chief of Staff.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-canvas text-ink antialiased">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 overflow-x-hidden">{children}</main>
        </div>
      </body>
    </html>
  )
}
