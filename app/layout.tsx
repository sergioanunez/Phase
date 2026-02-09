import type { Metadata } from "next"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { Inter, Cormorant_Garamond } from "next/font/google"
import "./globals.css"

const cormorantGaramond = Cormorant_Garamond({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-cormorant-garamond",
})
import dynamic from "next/dynamic"
import { Providers } from "./providers"
import { UserMenu } from "@/components/user-menu"
import { AppHeader } from "@/components/app-header"
import { ImpersonationBanner } from "@/components/impersonation-banner"

const AIAssistant = dynamic(
  () =>
    import("@/components/ai-assistant")
      .then((m) => ({ default: m.AIAssistant }))
      .catch(() => ({ default: () => null })),
  { ssr: false }
)

const inter = Inter({ subsets: ["latin"], display: "swap" })

export const metadata: Metadata = {
  title: "Phase",
  description: "Construction scheduling and management system",
  icons: {
    icon: "/favicon.png",
  },
}

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
}

const PUBLIC_PATHS = ["/", "/contact", "/start-trial"]

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = (await headers()).get("x-pathname") ?? ""
  const isPublic = pathname === "" || PUBLIC_PATHS.includes(pathname) || pathname.startsWith("/auth")
  if (!isPublic) {
    const session = await getServerSession(authOptions)
    if (session?.user && !session.user.companyId) {
      redirect("/start-trial")
    }
  }

  return (
    <html lang="en">
      <body className={`${inter.className} ${cormorantGaramond.variable}`}>
        <Providers>
          <ImpersonationBanner />
          <AppHeader />
          <UserMenu />
          {children}
          <AIAssistant />
        </Providers>
      </body>
    </html>
  )
}
