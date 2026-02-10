import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const isBuild = () =>
  process.env.NEXT_PHASE === "phase-production-build" || (process.env.VERCEL === "1" && process.env.CI === "1")

const updateDependenciesSchema = z.object({
  dependsOnItemIds: z.array(z.string()).optional().default([]),
})

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (isBuild()) {
      return NextResponse.json({ error: "Unavailable during build" }, { status: 503 })
    }
    const { getServerSession } = await import("next-auth")
    const { authOptions } = await import("@/lib/auth")
    const { prisma } = await import("@/lib/prisma")
    const { requirePermission } = await import("@/lib/rbac")

    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await requirePermission("templates:read")

    const templateItem = await prisma.workTemplateItem.findUnique({
      where: { id: params.id },
      select: { id: true, name: true },
    })

    if (!templateItem) {
      return NextResponse.json({ error: "Template item not found" }, { status: 404 })
    }

    const deps = await prisma.templateDependency.findMany({
      where: { templateItemId: params.id },
      select: { dependsOnItemId: true },
      orderBy: { createdAt: "asc" },
    })

    return NextResponse.json({
      templateItemId: params.id,
      dependsOnItemIds: deps.map((d) => d.dependsOnItemId),
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch dependencies" },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (isBuild()) {
      return NextResponse.json({ error: "Unavailable during build" }, { status: 503 })
    }
    const { prisma } = await import("@/lib/prisma")
    const { requirePermission } = await import("@/lib/rbac")

    await requirePermission("templates:write")
    const body = await request.json()
    const data = updateDependenciesSchema.parse(body)

    if (data.dependsOnItemIds.includes(params.id)) {
      return NextResponse.json(
        { error: "A work item cannot depend on itself" },
        { status: 400 }
      )
    }

    // Ensure all referenced template items exist
    const allTemplateItems = await prisma.workTemplateItem.findMany({
      select: { id: true },
    })
    const allowedIds = new Set(allTemplateItems.map((t) => t.id))

    for (const depId of data.dependsOnItemIds) {
      if (!allowedIds.has(depId)) {
        return NextResponse.json(
          { error: `Invalid dependency template item ID: ${depId}` },
          { status: 400 }
        )
      }
    }

    // Build full edge set (existing except this item, plus proposed)
    const existingDeps = await prisma.templateDependency.findMany()

    const edges: Array<{ from: string; to: string }> = []

    for (const dep of existingDeps) {
      if (dep.templateItemId === params.id) continue
      edges.push({ from: dep.dependsOnItemId, to: dep.templateItemId })
    }

    for (const dependsOnId of data.dependsOnItemIds) {
      edges.push({ from: dependsOnId, to: params.id })
    }

    // Cycle detection using Kahn's algorithm
    const nodeIds = allTemplateItems.map((t) => t.id)
    const inDegree: Record<string, number> = {}
    const neighbors: Record<string, string[]> = {}

    for (const id of nodeIds) {
      inDegree[id] = 0
      neighbors[id] = []
    }

    for (const { from, to } of edges) {
      neighbors[from].push(to)
      inDegree[to] += 1
    }

    const queue: string[] = []
    for (const id of nodeIds) {
      if (inDegree[id] === 0) queue.push(id)
    }

    const topo: string[] = []
    while (queue.length > 0) {
      const id = queue.shift()!
      topo.push(id)
      for (const nb of neighbors[id]) {
        inDegree[nb] -= 1
        if (inDegree[nb] === 0) queue.push(nb)
      }
    }

    if (topo.length !== nodeIds.length) {
      // There is at least one cycle; collect nodes with inDegree > 0
      const cyclicIds = nodeIds.filter((id) => inDegree[id] > 0)
      const cyclicItems = await prisma.workTemplateItem.findMany({
        where: { id: { in: cyclicIds } },
        select: { name: true },
      })
      const names = cyclicItems.map((t) => t.name).join(", ")
      return NextResponse.json(
        {
          error: `Dependency cycle detected between work items: ${names}`,
        },
        { status: 400 }
      )
    }

    // Replace dependencies for this template item
    await prisma.templateDependency.deleteMany({
      where: { templateItemId: params.id },
    })

    if (data.dependsOnItemIds.length > 0) {
      await prisma.templateDependency.createMany({
        data: data.dependsOnItemIds.map((depId) => ({
          templateItemId: params.id,
          dependsOnItemId: depId,
        })),
      })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    return NextResponse.json(
      { error: error.message || "Failed to update dependencies" },
      { status: 500 }
    )
  }
}

