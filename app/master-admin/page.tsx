import { redirect } from "next/navigation"

/**
 * Master Admin removed. Redirect to home.
 */
export default function MasterAdminPage() {
  redirect("/")
}
