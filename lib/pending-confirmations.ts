import type { PrismaClient } from "@prisma/client"
import { phonesMatch } from "@/lib/phone"
import { findContractorIdsBySenderPhone } from "@/lib/sms-inbound"

export type PendingConfirmationCard = {
  taskId: string
  homeId: string
  companyId: string | null
  taskName: string
  address: string
  scheduledDate: Date | null
  tradeName: string | null
  lastConfirmationAt: Date | null
}

/**
 * Find all open PendingConfirm tasks for a phone number.
 * Matches outbound confirmation SMS recipients and contractor contact phones.
 */
export async function findAllPendingConfirmationsForPhone(
  prisma: PrismaClient,
  from: string,
  options?: { companyId?: string | null }
): Promise<PendingConfirmationCard[]> {
  const byId = new Map<string, PendingConfirmationCard>()

  const outboundMessages = await prisma.smsMessage.findMany({
    where: {
      direction: "Outbound",
      confirmationCode: { not: null },
      homeTask: {
        status: "PendingConfirm",
        ...(options?.companyId
          ? {
              OR: [
                { companyId: options.companyId },
                { companyId: null, home: { companyId: options.companyId } },
              ],
            }
          : {}),
      },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      homeTask: {
        include: {
          contractor: { select: { companyName: true } },
          home: { select: { id: true, addressOrLot: true, companyId: true } },
        },
      },
    },
  })

  for (const msg of outboundMessages) {
    if (!msg.homeTask || !phonesMatch(msg.to, from)) continue
    const task = msg.homeTask
    const companyId = task.companyId ?? task.home?.companyId ?? null
    if (options?.companyId && companyId !== options.companyId) continue
    if (byId.has(task.id)) continue
    byId.set(task.id, {
      taskId: task.id,
      homeId: task.homeId,
      companyId,
      taskName: task.nameSnapshot,
      address: task.home?.addressOrLot ?? "",
      scheduledDate: task.scheduledDate,
      tradeName: task.contractor?.companyName ?? null,
      lastConfirmationAt: task.lastConfirmationAt,
    })
  }

  const contractorIds = await findContractorIdsBySenderPhone(from)
  if (contractorIds.length > 0) {
    const byContractor = await prisma.homeTask.findMany({
      where: {
        contractorId: { in: contractorIds },
        status: "PendingConfirm",
        ...(options?.companyId
          ? {
              OR: [
                { companyId: options.companyId },
                { companyId: null, home: { companyId: options.companyId } },
              ],
            }
          : {}),
      },
      include: {
        contractor: { select: { companyName: true } },
        home: { select: { id: true, addressOrLot: true, companyId: true } },
      },
      orderBy: { lastConfirmationAt: "desc" },
    })
    for (const task of byContractor) {
      if (byId.has(task.id)) continue
      const companyId = task.companyId ?? task.home?.companyId ?? null
      if (options?.companyId && companyId !== options.companyId) continue
      byId.set(task.id, {
        taskId: task.id,
        homeId: task.homeId,
        companyId,
        taskName: task.nameSnapshot,
        address: task.home?.addressOrLot ?? "",
        scheduledDate: task.scheduledDate,
        tradeName: task.contractor?.companyName ?? null,
        lastConfirmationAt: task.lastConfirmationAt,
      })
    }
  }

  return Array.from(byId.values()).sort((a, b) => {
    const at = a.lastConfirmationAt?.getTime() ?? a.scheduledDate?.getTime() ?? 0
    const bt = b.lastConfirmationAt?.getTime() ?? b.scheduledDate?.getTime() ?? 0
    return bt - at
  })
}

export async function countPendingConfirmationsForPhone(
  prisma: PrismaClient,
  from: string,
  options?: { companyId?: string | null }
): Promise<number> {
  const list = await findAllPendingConfirmationsForPhone(prisma, from, options)
  return list.length
}
