import { NextRequest, NextResponse } from "next/server"
import { homeTaskOrderByTemplateSequence } from "@/lib/work-template-display-order"
import { appendFileSync } from "fs"
import { join } from "path"
import { handleApiError } from "@/lib/api-response"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { TaskStatus } from "@prisma/client"
import { z } from "zod"

// #region agent log
function debugLog(payload: Record<string, unknown>) {
  try {
    const logPath = join(process.cwd(), ".cursor", "debug.log")
    appendFileSync(logPath, JSON.stringify({ ...payload, timestamp: payload.timestamp ?? Date.now() }) + "\n")
  } catch {}
}
// #endregion

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const updateTaskSchema = z.object({
  scheduledDate: z.string().datetime().optional().nullable(),
  contractorId: z.string().optional().nullable(),
  status: z.nativeEnum(TaskStatus).optional(),
  notes: z.string().optional().nullable(),
  /** When true (with scheduled date), set status to Confirmed and record manual confirmation metadata. */
  confirmManually: z.boolean().optional(),
})

const validTransitions: Record<TaskStatus, TaskStatus[]> = {
  Unscheduled: ["Scheduled", "Canceled"],
  Scheduled: ["PendingConfirm", "Confirmed", "Unscheduled", "Canceled", "Completed"],
  PendingConfirm: ["Confirmed", "Declined", "Unscheduled", "Canceled", "Completed"],
  Confirmed: ["InProgress", "Completed", "Unscheduled", "Canceled"],
  Declined: ["Unscheduled", "Canceled"],
  InProgress: ["Completed", "Canceled"],
  Completed: ["Confirmed", "Scheduled", "InProgress"],
  Canceled: ["Unscheduled"],
}

function isValidTransition(from: TaskStatus, to: TaskStatus): boolean {
  return validTransitions[from]?.includes(to) ?? false
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission, hasPermission } = await import("@/lib/rbac")
    const { getAssignedHomeIdsForContractor } = await import("@/lib/tenant")
    const ctx = await requireTenantPermission("tasks:read")

    // Match task by id and company: either task.companyId or task's home.companyId (for tasks with null companyId)
    const task = await prisma.homeTask.findFirst({
      where: {
        id: params.id,
        OR: [
          { companyId: ctx.companyId },
          { companyId: null, home: { companyId: ctx.companyId } },
        ],
      },
      include: {
        home: { include: { subdivision: true } },
        contractor: true,
        templateItem: true,
        smsMessages: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    })

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    // Subcontractor: only tasks on assigned homes and their contractor
    if (ctx.role === "Subcontractor" && ctx.contractorId) {
      const assignedHomeIds = await getAssignedHomeIdsForContractor(ctx.companyId, ctx.contractorId)
      if (!assignedHomeIds.includes(task.homeId) || task.contractorId !== ctx.contractorId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    }

    // Validation: If task has status "Scheduled" but no scheduledDate, fix it
    if (task.status === "Scheduled" && !task.scheduledDate) {
      const updatedTask = await prisma.homeTask.update({
        where: { id: params.id },
        data: { status: "Unscheduled" },
        include: {
          home: { include: { subdivision: true } },
          contractor: true,
          templateItem: true,
          smsMessages: { orderBy: { createdAt: "desc" }, take: 10 },
        },
      })
      return NextResponse.json(updatedTask)
    }

    return NextResponse.json(task)
  } catch (error: any) {
    return handleApiError(error)
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // #region agent log
  const patchStart = Date.now()
  const logPayload = (step: string, extra: Record<string, unknown> = {}) => ({
    location: "app/api/tasks/[id]/route.ts:PATCH",
    message: `PATCH tasks ${step}`,
    data: { step, taskId: params.id, ms: Date.now(), sinceStart: Date.now() - patchStart, ...extra },
    timestamp: Date.now(),
    hypothesisId: "H1",
  })
  debugLog(logPayload("start", { ms: patchStart, sinceStart: 0 }))
  fetch("http://127.0.0.1:7242/ingest/e312e361-00a8-46be-b4af-dc6d93b8db2f", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(logPayload("start", { ms: patchStart })) }).catch(() => {})
  // #endregion
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { hasPermission } = await import("@/lib/rbac")
    const { createAuditLog } = await import("@/lib/audit")
    const { requireTenantContext } = await import("@/lib/tenant")
    const ctx = await requireTenantContext()
    const body = await request.json()
    const data = updateTaskSchema.parse(body)

    const before = await prisma.homeTask.findFirst({
      where: {
        id: params.id,
        OR: [
          { companyId: ctx.companyId },
          { companyId: null, home: { companyId: ctx.companyId } },
        ],
      },
      include: {
        home: {
          include: {
            subdivision: true,
          },
        },
      },
    })

    if (!before) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    // Only builder-side roles (Superintendent, Manager, Admin) can update tasks; contractors cannot mark complete
    if (!hasPermission(ctx.role, "tasks:write")) {
      const err = new Error("Forbidden") as Error & { statusCode?: number }
      err.statusCode = 403
      throw err
    }

    // Check for dependency blocking and gate blocking before allowing scheduling
    if (data.scheduledDate !== undefined && data.scheduledDate) {
      if (ctx.companyId) {
        const { getBillingGates, UPGRADE_TITLE, UPGRADE_BODY } = await import("@/lib/billing/entitlements")
        const gates = await getBillingGates(prisma, ctx.companyId)
        if (!gates.canScheduleTasks) {
          return NextResponse.json(
            {
              error: UPGRADE_BODY,
              code: "TRIAL_ENDED",
              upgradeHint: "/admin/billing",
              title: UPGRADE_TITLE,
            },
            { status: 403 }
          )
        }
      }

      // Get all tasks for this home with their categories for category-gate checks
      const allTasks = await prisma.homeTask.findMany({
        where: { homeId: before.homeId },
        include: {
          templateItem: {
            select: {
              isDependency: true,
              optionalCategory: true,
            },
          },
        },
        orderBy: [...homeTaskOrderByTemplateSequence()],
      })

      const currentTask = allTasks.find((t) => t.id === params.id)
      if (!currentTask) {
        return NextResponse.json({ error: "Task not found" }, { status: 404 })
      }

      const currentTaskCategory = currentTask.templateItem?.optionalCategory || "Uncategorized"
      const currentTaskIndex = allTasks.findIndex((t) => t.id === params.id)

      // Category order (same as in UI)
      const categoryOrder = [
        "Preliminary work",
        "Foundation",
        "Structural",
        "Interior finishes / exterior rough work",
        "Finals punches and inspections.",
        "Pre-sale completion package",
      ]

      // Get the index of the current category in the order
      const getCategoryIndex = (category: string | null): number => {
        const normalized = (category || "Uncategorized").toLowerCase().trim().replace("prelliminary", "preliminary")
        const index = categoryOrder.findIndex(
          (orderCat) => orderCat.toLowerCase().trim() === normalized
        )
        return index !== -1 ? index : 999 // Uncategorized goes last
      }

      const currentCategoryIndex = getCategoryIndex(currentTaskCategory)

      // Check category gates for this tenant only
      const categoryGates = await prisma.categoryGate.findMany({
        where:
          ctx.companyId != null ? { companyId: ctx.companyId } : { companyId: null },
      })

      const normalizeCategory = (c: string | null) =>
        (c || "Uncategorized").toLowerCase().trim().replace(/prelliminary/gi, "preliminary")

      for (const categoryGate of categoryGates) {
        const gateCategoryIndex = getCategoryIndex(categoryGate.categoryName)

        // Only check gates for categories before the current task's category
        if (gateCategoryIndex >= currentCategoryIndex) {
          continue
        }

        // Check if this gate applies
        let gateApplies = false

        if (categoryGate.gateScope === "AllScheduling") {
          gateApplies = true
        } else if (categoryGate.gateScope === "DownstreamOnly") {
          // Gate applies to tasks after this category
          gateApplies = currentCategoryIndex > gateCategoryIndex
        }

        if (gateApplies) {
          // Check if all tasks in the gated category are completed (match by normalized name)
          const gateCategoryNorm = normalizeCategory(categoryGate.categoryName)
          const gatedCategoryTasks = allTasks.filter(
            (task) =>
              normalizeCategory(task.templateItem?.optionalCategory ?? null) === gateCategoryNorm
          )

          const incompleteGatedTasks = gatedCategoryTasks.filter(
            (task) => task.status !== "Completed" && task.status !== "Canceled"
          )

          if (incompleteGatedTasks.length > 0) {
            const gateName = categoryGate.gateName || `${categoryGate.categoryName.replace(/Prelliminary/gi, "Preliminary")} Gate`
            const taskNames = incompleteGatedTasks.map((t) => t.nameSnapshot).join(", ")
            return NextResponse.json(
              {
                error: `Cannot schedule this task. All tasks in "${gateName}" must be completed first: ${taskNames}`,
                categoryBlocked: true,
              },
              { status: 400 }
            )
          }
        }
      }

      // Check gate blocking
      const { checkGateBlocking } = await import("@/lib/gates")
      const gateCheck = await checkGateBlocking(
        before.homeId,
        params.id,
        before.sortOrderSnapshot
      )

      if (gateCheck.isBlocked) {
        return NextResponse.json(
          {
            error: `Scheduling blocked until "${gateCheck.blockingGateName}" punchlist is cleared. ${gateCheck.openPunchCount} open punch item(s) remaining.`,
            gateBlocked: true,
            blockingGateName: gateCheck.blockingGateName,
            openPunchCount: gateCheck.openPunchCount,
          },
          { status: 409 }
        )
      }
    }

    const updateData: any = {}
    if (data.scheduledDate !== undefined) {
      updateData.scheduledDate = data.scheduledDate
        ? new Date(data.scheduledDate)
        : null
      // Auto-set status to Scheduled if date is set
      if (data.scheduledDate && before.status === "Unscheduled") {
        updateData.status = "Scheduled"
      }
      // Auto-set status to Unscheduled if date is cleared
      if (!data.scheduledDate && before.scheduledDate && isValidTransition(before.status, "Unscheduled")) {
        updateData.status = "Unscheduled"
        updateData.confirmedAt = null
        updateData.confirmedByUserId = null
        updateData.confirmationSource = null
      }
    }
    
    // Validation: If task has status "Scheduled" but no scheduledDate, fix it
    const finalScheduledDate = updateData.scheduledDate !== undefined 
      ? updateData.scheduledDate 
      : before.scheduledDate
    if (finalScheduledDate === null && before.status === "Scheduled" && !updateData.status) {
      if (isValidTransition(before.status, "Unscheduled")) {
        updateData.status = "Unscheduled"
        updateData.confirmedAt = null
        updateData.confirmedByUserId = null
        updateData.confirmationSource = null
      }
    }
    if (data.contractorId !== undefined) {
      updateData.contractorId = data.contractorId
    }
    if (data.notes !== undefined) {
      updateData.notes = data.notes
    }
    if (data.status !== undefined) {
      if (!isValidTransition(before.status, data.status)) {
        return NextResponse.json(
          {
            error: `Invalid status transition from ${before.status} to ${data.status}`,
          },
          { status: 400 }
        )
      }
      // Execution lock: cannot enter InProgress until all dependencies are Complete
      if (data.status === "InProgress" || data.status === "Completed") {
        const { getIncompletePrerequisiteDependencyNames } = await import("@/lib/tasks/dependency-guard")
        const deps = await getIncompletePrerequisiteDependencyNames({
          prisma,
          homeId: before.homeId,
          templateItemId: before.templateItemId,
          companyId: ctx.companyId ?? null,
        })

        if (deps.length > 0) {
          const depNamesJoined = deps.join(", ")
          return NextResponse.json(
            {
              code: "DEPENDENCY_BLOCKED",
              dependencyBlocked: true,
              dependencies: deps,
              error:
                data.status === "InProgress"
                  ? `Cannot start yet — this task depends on ${depNamesJoined} being complete.`
                  : `Cannot complete yet — this task depends on ${depNamesJoined} being complete.`,
            },
            { status: 409 }
          )
        }
      }
      updateData.status = data.status

      if (
        before.status === "Confirmed" &&
        data.status !== "Confirmed" &&
        (data.status === "Unscheduled" || data.status === "Canceled")
      ) {
        updateData.confirmedAt = null
        updateData.confirmedByUserId = null
        updateData.confirmationSource = null
      }

      // Set startedAt when entering InProgress (if not already set)
      if (data.status === "InProgress" && !before.startedAt) {
        updateData.startedAt = new Date()
      }
      // Set completedAt if status is Completed
      if (data.status === "Completed" && !before.completedAt) {
        updateData.completedAt = new Date()
      }
      // Clear completedAt if status is changed from Completed to something else
      if (before.status === "Completed" && data.status !== "Completed") {
        updateData.completedAt = null
      }
    }

    let shouldLogManualConfirm = false
    if (data.confirmManually === true) {
      if (data.status !== undefined) {
        return NextResponse.json(
          { error: "Cannot combine confirmManually with status in the same request." },
          { status: 400 }
        )
      }
      const finalScheduledForConfirm =
        updateData.scheduledDate !== undefined ? updateData.scheduledDate : before.scheduledDate
      if (!finalScheduledForConfirm) {
        return NextResponse.json(
          { error: "Scheduled date is required to mark confirmed" },
          { status: 400 }
        )
      }
      if (updateData.scheduledDate === null) {
        return NextResponse.json(
          { error: "Cannot mark confirmed while removing the scheduled date" },
          { status: 400 }
        )
      }

      if (before.status === "Confirmed") {
        // Idempotent: keep existing confirmation (e.g. SMS); do not overwrite source or re-log.
      } else if (
        before.status === "Unscheduled" ||
        before.status === "Scheduled" ||
        before.status === "PendingConfirm"
      ) {
        updateData.status = "Confirmed"
        updateData.confirmedAt = new Date()
        updateData.confirmedByUserId = ctx.userId
        updateData.confirmationSource = "Manual"
        shouldLogManualConfirm = true
      } else {
        return NextResponse.json(
          { error: `Cannot mark confirmed from status ${before.status}` },
          { status: 400 }
        )
      }
    }

    const after = await prisma.homeTask.update({
      where: { id: params.id },
      data: updateData,
      include: {
        contractor: true,
        home: {
          include: {
            subdivision: true,
          },
        },
      },
    })
    // #region agent log
    debugLog(logPayload("afterUpdate"))
    fetch("http://127.0.0.1:7242/ingest/e312e361-00a8-46be-b4af-dc6d93b8db2f", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(logPayload("afterUpdate")) }).catch(() => {})
    // #endregion

    // Ensure subcontractor can see this home when assigned to a task
    if (after.contractorId) {
      await prisma.contractorAssignment.upsert({
        where: {
          contractorId_homeId: {
            contractorId: after.contractorId,
            homeId: after.homeId,
          },
        },
        create: {
          companyId: ctx.companyId,
          contractorId: after.contractorId,
          homeId: after.homeId,
        },
        update: {},
      })
    }

    await createAuditLog(ctx.userId, "HomeTask", params.id, "UPDATE", before, after, ctx.companyId)

    if (shouldLogManualConfirm) {
      const logCompanyId = after.companyId ?? ctx.companyId
      if (logCompanyId) {
        const actor = await prisma.user.findUnique({
          where: { id: ctx.userId },
          select: { name: true },
        })
        const { createTaskManuallyConfirmedEvent } = await import("@/lib/activity")
        await createTaskManuallyConfirmedEvent({
          companyId: logCompanyId,
          homeId: after.homeId,
          taskId: params.id,
          taskName: after.nameSnapshot,
          actorName: actor?.name ?? null,
        })
      }
    }

    // #region agent log
    debugLog(logPayload("afterAudit"))
    fetch("http://127.0.0.1:7242/ingest/e312e361-00a8-46be-b4af-dc6d93b8db2f", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(logPayload("afterAudit")) }).catch(() => {})
    // #endregion

    const companyId = after.companyId ?? ctx.companyId
    if (companyId) {
      const { recalculateHomeCompletion } = await import("@/lib/home-completion")
      await recalculateHomeCompletion(prisma, after.homeId, companyId)
    }
    // #region agent log
    debugLog(logPayload("afterRecalc"))
    fetch("http://127.0.0.1:7242/ingest/e312e361-00a8-46be-b4af-dc6d93b8db2f", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(logPayload("afterRecalc")) }).catch(() => {})
    // #endregion
    if (companyId && after.home) {
      const { notifyTaskScheduled, notifyTaskCompleted } = await import("@/lib/notificationRules")
      const homeLabel = (after.home as { addressOrLot?: string }).addressOrLot ?? "Home"
      if (before.status !== "Scheduled" && after.status === "Scheduled" && after.scheduledDate) {
        await notifyTaskScheduled({
          companyId,
          homeId: after.homeId,
          taskId: params.id,
          taskName: after.nameSnapshot,
          homeLabel,
          scheduledDate: after.scheduledDate,
        }).catch((err) => console.error("notifyTaskScheduled:", err))
        const { createTaskScheduledEvent } = await import("@/lib/activity")
        createTaskScheduledEvent({
          companyId,
          homeId: after.homeId,
          taskId: params.id,
          taskName: after.nameSnapshot,
          scheduledDate: after.scheduledDate,
          recipientName: (after as { contractor?: { companyName?: string } }).contractor?.companyName ?? undefined,
        }).catch(() => {})
      }
      if (before.status !== "Completed" && after.status === "Completed") {
        await notifyTaskCompleted({
          companyId,
          homeId: after.homeId,
          taskId: params.id,
          taskName: after.nameSnapshot,
          homeLabel,
        }).catch((err) => console.error("notifyTaskCompleted:", err))
      }
    }
    // #region agent log
    debugLog(logPayload("end"))
    fetch("http://127.0.0.1:7242/ingest/e312e361-00a8-46be-b4af-dc6d93b8db2f", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(logPayload("end")) }).catch(() => {})
    // #endregion

    return NextResponse.json(after)
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    return handleApiError(error)
  }
}
