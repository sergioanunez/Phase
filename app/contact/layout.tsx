import type { Metadata } from "next"
import type { ReactNode } from "react"

export const metadata: Metadata = {
  title: "Contact | Phase",
  description:
    "See if Phase fits your operation. We route serious builders to the right next step—demo or Founders10.",
}

export default function ContactLayout({ children }: { children: ReactNode }) {
  return children
}
