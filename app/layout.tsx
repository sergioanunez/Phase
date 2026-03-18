import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Inter, Cormorant_Garamond } from "next/font/google"
import "./globals.css"

const cormorantGaramond = Cormorant_Garamond({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-cormorant-garamond",
})
import { Providers } from "./providers"
import { AppHeader } from "@/components/app-header"
import { ImpersonationBanner } from "@/components/impersonation-banner"
import { TrialExpiredOverlay } from "@/components/billing/trial-expired-overlay"
import { OnboardingTour } from "@/components/onboarding/onboarding-tour"
import { PullToRefresh } from "@/components/pull-to-refresh"
import { Navigation } from "@/components/navigation"

const inter = Inter({ subsets: ["latin"], display: "swap" })

export const metadata: Metadata = {
  title: "Phase",
  description: "Construction scheduling and management system",
  manifest: "/manifest.json",
  icons: [
    {
      rel: "icon",
      url: "/favicon.png",
      type: "image/png",
    },
    {
      rel: "apple-touch-icon",
      url: "/icon-192.png",
      sizes: "192x192",
      type: "image/png",
    },
  ],
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Phase",
  },
}

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#111827",
}

const PUBLIC_PATHS = ["/", "/contact", "/start-trial"]

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { headers } = await import("next/headers")
  const pathname = (await headers()).get("x-pathname") ?? ""

  if (process.env.NEXT_PHASE === "phase-production-build") {
    return (
      <html lang="en">
        <body className={`${inter.className} ${cormorantGaramond.variable}`}>
          <Providers>
            <ImpersonationBanner />
            <AppHeader />
            <TrialExpiredOverlay />
            <PullToRefresh>
              <main className="min-h-screen bg-[#F6F7F9]">
                {children}
              </main>
            </PullToRefresh>
            <Navigation />
            <OnboardingTour />
          </Providers>
        </body>
      </html>
    )
  }
  const { getServerSession } = await import("next-auth")
  const { authOptions } = await import("@/lib/auth")
  const isPublic = pathname === "" || PUBLIC_PATHS.includes(pathname) || pathname.startsWith("/auth") || pathname.startsWith("/punchlist")
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
          <TrialExpiredOverlay />
          <PullToRefresh>
            <main className="min-h-screen bg-[#F6F7F9]">
              {children}
            </main>
          </PullToRefresh>
          <Navigation />
          <OnboardingTour />
        </Providers>
      </body>
    </html>
  )
}
