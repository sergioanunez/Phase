"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Navigation } from "@/components/navigation"
import { Button } from "@/components/ui/button"
import { CheckCircle } from "lucide-react"

export default function BillingSuccessPage() {
  const router = useRouter()

  useEffect(() => {
    // Optional: refresh billing state after a short delay so /billing shows updated subscription
    const t = setTimeout(() => router.refresh(), 500)
    return () => clearTimeout(t)
  }, [router])

  return (
    <div className="min-h-screen bg-[#F6F7F9] pb-24 pt-20">
      <div className="app-container px-4 flex flex-col items-center justify-center min-h-[60vh]">
        <CheckCircle className="h-16 w-16 text-green-600 mb-4" />
        <h1 className="text-2xl font-bold text-center">Subscription started</h1>
        <p className="text-muted-foreground text-center mt-2 max-w-md">
          Your billing is now active. You can manage your plan and payment method from the billing page.
        </p>
        <Button asChild className="mt-6">
          <Link href="/billing">Go to Billing</Link>
        </Button>
      </div>
      <Navigation />
    </div>
  )
}
