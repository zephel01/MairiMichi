import type { Metadata } from 'next'
import './globals.css'
import { Attribution } from '@/components/Attribution'

export const metadata: Metadata = {
  title: 'MairiMichi — まいり道',
  description:
    'ご利益・アクセス難易度・御朱印で神社仏閣を探せます。分類の根拠は祭神・本尊と一次史料まで示します。',
}


export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="bg-white text-neutral-900 antialiased">
        {children}
        <Attribution />
      </body>
    </html>
  )
}
