import { Prisma } from "@prisma/client"
import { prisma } from "./prisma"

export async function createAuditLog(
  userId: string,
  entityType: string,
  entityId: string,
  action: string,
  beforeJson?: any,
  afterJson?: any,
  companyId?: string | null
) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        entityType,
        entityId,
        action,
        beforeJson: beforeJson ? JSON.stringify(beforeJson) : null,
        afterJson: afterJson ? JSON.stringify(afterJson) : null,
        companyId: companyId ?? undefined,
      },
    })
  } catch (error) {
    console.error("Failed to create audit log:", error)
  }
}

/** Super-admin audit: action + metaJson; entityType/entityId optional. */
export async function createSuperAdminAuditLog(
  actorUserId: string,
  action: string,
  metaJson?: Record<string, unknown> | null,
  companyId?: string | null,
  entityType?: string | null,
  entityId?: string | null
) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: actorUserId,
        action,
        metaJson: metaJson != null ? (metaJson as Prisma.InputJsonValue) : undefined,
        companyId: companyId ?? undefined,
        entityType: entityType ?? undefined,
        entityId: entityId ?? undefined,
      },
    })
  } catch (error) {
    console.error("Failed to create super-admin audit log:", error)
  }
}
