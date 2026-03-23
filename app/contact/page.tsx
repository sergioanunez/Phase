import { Suspense } from "react"
import { ContactIntake } from "@/components/contact/contact-intake"

export default function ContactPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F6F7F9]" aria-busy="true" aria-label="Loading" />
      }
    >
      <ContactIntake />
    </Suspense>
  )
}
