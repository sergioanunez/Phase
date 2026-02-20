import Link from "next/link"
import { LandingFooter } from "@/components/landing/landing-footer"
import { LandingNav } from "@/components/landing/landing-nav"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Privacy Policy",
  description: "Privacy policy for Phase.",
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#F6F7F9]">
      <LandingNav />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
          Privacy Policy
        </h1>
        <p className="mt-8 text-lg text-gray-600">
          Coming soon.
        </p>
        <p className="mt-6">
          <Link
            href="/"
            className="text-sm font-medium text-primary hover:underline"
          >
            ← Back to home
          </Link>
        </p>
      </main>
      <LandingFooter />
    </div>
  )
}
