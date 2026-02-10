import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireTenantPermission, hasPermission } from "@/lib/rbac"
import { requireTenantContext } from "@/lib/tenant"
import { getAssignedHomeIdsForContractor } from "@/lib/tenant"
import { createAuditLog } from "@/lib/audit"
import { handleApiError } from "@/lib/api-response"
import { checkGateBlocking } from "@/lib/gates"
import { TaskStatus } from "@prisma/client"
import { z } from "zod"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

const updateTaskSchema = z.object({
  scheduledDate: z.string().datetime().optional().nullable(),
  contractorId: z.string().optional().nullable(),
  status: z.nativeEnum(TaskStatus).optional(),
  notes: z.string().optional().nullable(),
})

const validTransitions: Record<TaskStatus, TaskStatus[]> = {
  Unscheduled: ["Scheduled", "Canceled"],
  Scheduled: ["PendingConfirm", "Unscheduled", "Canceled", "Completed"],
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
    const ctx = await requireTenantPermission("tasks:read")

    const task = await prisma.homeTask.findFirst({
      where: { id: params.id, companyId: ctx.companyId },
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
  try {
    const ctx = await requireTenantContext()
    const body = await request.json()
    const data = updateTaskSchema.parse(body)

    const before = await prisma.homeTask.findFirst({
      where: { id: params.id, companyId: ctx.companyId },
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
      // Check template-level dependencies mapped onto this home's tasks
      const currentTaskWithTemplate = await prisma.homeTask.findUnique({
        where: { id: params.id },
        include: {
          templateItem: {
            select: { id: true, name: true },
          },
        },
      })

      if (!currentTaskWithTemplate) {
        return NextResponse.json({ error: "Task not found" }, { status: 404 })
      }

      const templateDeps = await prisma.templateDependency.findMany({
        where: { companyId: ctx.companyId, templateItemId: currentTaskWithTemplate.templateItemId },
      })

      if (templateDeps.length > 0) {
        const prereqTasks = await prisma.homeTask.findMany({
          where: {
            homeId: before.homeId,
            templateItemId: {
              in: templateDeps.map((d: { dependsOnItemId: string }) => d.dependsOnItemId),
            },
          },
        })

        const incompletePrereqs = prereqTasks.filter(
          (t) => t.status !== "Completed"
        )

        if (incompletePrereqs.length > 0) {
          const names = incompletePrereqs.map((t) => t.nameSnapshot).join(", ")
          return NextResponse.json(
            {
              error: `Task blocked until prerequisites are completed: ${names}`,
              dependencyBlocked: true,
            },
            { status: 409 }
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
        orderBy: {
          sortOrderSnapshot: "asc",
        },
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

      // Check category gates - only check categories that are marked as gates
      const categoryGates = await prisma.categoryGate.findMany()
      
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
          // Check if all tasks in the gated category are completed
          const gatedCategoryTasks = allTasks.filter(
            (task) => (task.templateItem?.optionalCategory || "Uncategorized") === categoryGate.categoryName
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


      // Check dependencies
      const previousDependencyTasks = allTasks
        .slice(0, currentTaskIndex)
        .filter((task) => task.templateItem?.isDependency)

      const incompleteDependencies = previousDependencyTasks.filter(
        (task) => task.status !== "Completed"
      )

      if (incompleteDependencies.length > 0) {
        const dependencyNames = incompleteDependencies
          .map((t) => t.nameSnapshot)
          .join(", ")
        return NextResponse.json(
          {
            error: `Cannot schedule this task. The following dependency tasks must be completed first: ${dependencyNames}`,
          },
          { status: 400 }
        )
      }

      // Check gate blocking
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
      }
    }
    
    // Validation: If task has status "Scheduled" but no scheduledDate, fix it
    const finalScheduledDate = updateData.scheduledDate !== undefined 
      ? updateData.scheduledDate 
      : before.scheduledDate
    if (finalScheduledDate === null && before.status === "Scheduled" && !updateData.status) {
      if (isValidTransition(before.status, "Unscheduled")) {
        updateData.status = "Unscheduled"
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
      updateData.status = data.status

      // Set completedAt if status is Completed
      if (data.status === "Completed" && !before.completedAt) {
        updateData.completedAt = new Date()
      }
      // Clear completedAt if status is changed from Completed to something else
      if (before.status === "Completed" && data.status !== "Completed") {
        updateData.completedAt = null
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

    return NextResponse.json(after)
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    return handleApiError(error)
  }
}
