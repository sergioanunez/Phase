import type { Metadata } from "next"
import { loadConfirmationAccessByToken } from "@/lib/confirmation-access-token"
import { findAllPendingConfirmationsForPhone } from "@/lib/pending-confirmations"
import { ConfirmationPortal } from "@/components/confirmation-portal"

export const metadata: Metadata = {
  title: "Pending confirmations",
  description: "Review and respond to work confirmations",
  robots: "noindex, nofollow",
}

export const dynamic = "force-dynamic"

function ErrorState({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <h1 className="text-xl font-bold text-foreground mb-2">{title}</h1>
      <p className="text-sm text-muted-foreground">{body}</p>
    </div>
  )
}

export default async function ConfirmationMagicLinkPage({
  params,
}: {
  params: { token: string } | Promise<{ token: string }>
}) {
  const { prisma } = await import("@/lib/prisma")
  const resolved = await Promise.resolve(params)
  const token = decodeURIComponent(resolved?.token?.trim() ?? "")

  if (!token) {
    return <ErrorState title="This confirmation link is invalid." body="Please contact your builder." />
  }

  const access = await loadConfirmationAccessByToken(prisma, token)
  if (!access.ok) {
    if (access.reason === "expired") {
      return (
        <ErrorState
          title="This confirmation link has expired."
          body="Please contact your builder."
        />
      )
    }
    return (
      <ErrorState
        title="This confirmation link is invalid."
        body="Please contact your builder."
      />
    )
  }

  const pending = await findAllPendingConfirmationsForPhone(prisma, access.phoneNormalized, {
    companyId: access.companyId,
  })

  const items = pending.map((p) => ({
    taskId: p.taskId,
    address: p.address,
    taskName: p.taskName,
    scheduledDate: p.scheduledDate ? p.scheduledDate.toISOString() : null,
    tradeName: p.tradeName,
    status: "pending" as const,
  }))

  return (
    <ConfirmationPortal
      token={token}
      companyName={access.companyName}
      initialItems={items}
    />
  )
}
