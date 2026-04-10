import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'N의 위키',
  description: '카카오톡 담론 아카이브 · 개념 · 토론',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
