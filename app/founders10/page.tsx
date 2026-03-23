import type { Metadata } from "next"
import { Founders10Page } from "@/components/founders10/founders10-page"

export const metadata: Metadata = {
  title: "Founders10 | Phase",
  description:
    "Limited early-adopter group for builders who will help shape Phase in the field. Invitation-only.",
}

export default function Founders10Route() {
  return <Founders10Page />
}
