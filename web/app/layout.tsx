import type { Metadata } from "next"
import "./globals.css"
export const metadata: Metadata = {
  title: "Trading MVP — 台股策略儀表板",
  description: "多策略 vs GP 演化，每日開盤訊號即時更新",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW">
      <body className="bg-gray-950 text-gray-100 min-h-screen">{children}</body>
    </html>
  )
}
