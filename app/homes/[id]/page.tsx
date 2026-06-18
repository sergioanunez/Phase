import { Suspense } from "react"
import { HomeDetailPage } from "@/components/homes/home-detail-page"

function HomeDetailLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div>Loading...</div>
    </div>
  )
}

export default function HomeDetailRoutePage() {
  return (
    <Suspense fallback={<HomeDetailLoading />}>
      <HomeDetailPage />
    </Suspense>
  )
}
