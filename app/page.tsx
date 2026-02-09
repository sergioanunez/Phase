import { redirect } from "next/navigation"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { LandingPage } from "@/components/landing/landing-page"

export default async function Home() {
  const session = await getServerSession(authOptions)

  if (session?.user) {
    const role = session.user.role ?? ""
    if (role === "SUPER_ADMIN") {
      redirect("/super-admin")
    }
    if (role === "Subcontractor") {
      redirect("/my-schedule")
    }
    if (role === "Manager" || role === "Admin") {
      redirect("/dashboard")
    }
    redirect("/homes")
  }

  return <LandingPage />
}
