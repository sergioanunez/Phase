import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { getBaseUrl } from "@/lib/url"
import { format } from "date-fns"
import type { Metadata } from "next"
import { PublicPunchlistView } from "./public-punchlist-view"

export const metadata: Metadata = {
  title: "Punchlist",
  description: "View punchlist items and photos",
  robots: "noindex, nofollow",
}

export default async function PublicPunchlistPage({
  params,
}: {
  params: { token: string }
}) {
  const token = decodeURIComponent(params.token?.trim() ?? "")
  if (!token) notFound()

  const share = await prisma.punchlistShare.findUnique({
    where: { token, enabled: true },
    include: {
      company: { select: { name: true, brandAppName: true } },
      home: { select: { addressOrLot: true } },
    },
  })

  if (!share) notFound()
  if (share.expiresAt && share.expiresAt < new Date()) notFound()

  const punchItems = await prisma.punchItem.findMany({
    where: {
      relatedHomeTaskId: share.homeTaskId,
      status: { in: ["Open", "ReadyForReview"] },
    },
    include: {
      photos: { orderBy: { createdAt: "asc" } },
    },
    orderBy: { createdAt: "asc" },
  })

  const tenantName =
    (share.company?.brandAppName || share.company?.name || "Phase").trim() || "Phase"
  const address = share.home?.addressOrLot ?? ""
  const dueDate = share.dueDate
  const sentAt = share.sentAt
  const baseUrl = getBaseUrl()

  const items = punchItems.map((item, idx) => ({
    number: idx + 1,
    title: item.title,
    description: item.description ?? undefined,
    notes: item.description ?? undefined,
    status: item.status,
    photos: item.photos.map((p) => ({
      id: p.id,
      url: p.imageUrl.startsWith("http") ? p.imageUrl : `${baseUrl}${p.imageUrl}`,
    })),
  }))

  return (
    <PublicPunchlistView
      tenantName={tenantName}
      address={address}
      dueDate={dueDate}
      sentAt={sentAt}
      items={items}
    />
  )
}
