import { redirect } from "next/navigation"
import { LandingPage } from "@/components/landing/landing-page"

// Home must always be dynamic so it can see the current NextAuth session and redirect
export const dynamic = "force-dynamic"

export default async function Home() {
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return <LandingPage />
  }
  const { getServerSession } = await import("next-auth")
  const { authOptions } = await import("@/lib/auth")
  const session = await getServerSession(authOptions)

  if (session?.user) {
    redirect("/dashboard")
  }

  return <LandingPage />
}
