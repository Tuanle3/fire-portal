import '../styles/globals.css'
import type { Metadata, Viewport } from 'next'
import FirebaseAuthInit from '@/components/FirebaseAuthInit'   // 👈 đổi path

export const metadata: Metadata = {
  title: 'Fire Portal',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <FirebaseAuthInit />
        {children}
      </body>
    </html>
  )
}