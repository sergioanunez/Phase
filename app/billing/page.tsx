import { redirect } from "next/navigation"

/**
 * Legacy route: redirect to tenant Billing under Settings.
 * Keeps old /billing URLs working.
 */
export default function BillingRedirectPage() {
  redirect("/admin/billing")
}
