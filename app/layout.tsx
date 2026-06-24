import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ASR Labeling Tool',
  description: 'Vietnamese medical ASR pseudo-label review',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  )
}
