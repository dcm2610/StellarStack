import { Geist, Geist_Mono } from "next/font/google"
import type { Metadata } from "next"

import "@workspace/ui/globals.css"
import { Providers } from "@/components/providers"
import { ScrollToTop } from "@/components/ScrollToTop"

const fontSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
})

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: "StellarStack - Open Source Game Server Management",
  description: "The modern, open-source game server hosting panel. Deploy, manage, and scale game servers with an intuitive interface built for developers and hosting providers.",
  keywords: ["game server", "hosting", "minecraft", "rust", "valheim", "panel", "open source", "self-hosted"],
  authors: [{ name: "StellarStack" }],
  openGraph: {
    title: "StellarStack - Open Source Game Server Management",
    description: "Deploy, manage, and scale game servers with an intuitive interface.",
    url: "https://stellarstack.app",
    siteName: "StellarStack",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "StellarStack - Open Source Game Server Management",
    description: "Deploy, manage, and scale game servers with an intuitive interface.",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="scroll-smooth">
      <body
        className={`${fontSans.variable} ${fontMono.variable} font-sans antialiased`}
      >
        <Providers>
          <ScrollToTop />
          {children}
        </Providers>
      </body>
    </html>
  )
}
