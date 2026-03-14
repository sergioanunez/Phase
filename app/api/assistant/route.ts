import { NextRequest, NextResponse } from "next/server"
import { handleApiError } from "@/lib/api-response"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { requireTenantContext } from "@/lib/tenant"
import { parseIntent } from "@/lib/assistant/intents"
import {
  resolveHome,
  resolveTask,
  resolvePunchlistTask,
  resolveContractor,
  parseRelativeDate,
} from "@/lib/assistant/resolve"
import type {
  AssistantInterpretResult,
  ScheduleTaskPreview,
  PunchlistPreview,
  MaterialRequestPreview,
} from "@/lib/assistant/types"
import type { ScheduleTaskIntent, CreatePunchlistIntent, CreateMaterialRequestIntent } from "@/lib/assistant/types"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

function getAllowedHomeIds(
  companyId: string,
  userId: string,
  role: string
): Promise<string[]> {
  if (role === "Superintendent") {
    return import("@/lib/prisma").then(({ prisma }) =>
      prisma.homeAssignment
        .findMany({
          where: { companyId, superintendentUserId: userId },
          select: { homeId: true },
        })
        .then((a) => a.map((x) => x.homeId))
    )
  }
  return import("@/lib/prisma").then(({ prisma }) =>
    prisma.home.findMany({ where: { companyId }, select: { id: true } }).then((h) => h.map((x) => x.id))
  )
}

async function buildReadResponse(
  readType: string,
  addressFragment: string | undefined,
  ctx: { companyId: string; userId: string; role: string },
  cookieHeader: string
): Promise<{ message: string; data?: Record<string, unknown> }> {
  const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000"
  const headers: HeadersInit = cookieHeader ? { cookie: cookieHeader } : {}
  const [flowRes, portfolioRes] = await Promise.all([
    fetch(`${base}/api/flow?filter=all`, { headers }).catch(() => null),
    fetch(`${base}/api/dashboard/portfolio`, { headers }).catch(() => null),
  ])
  const flowJson = flowRes?.ok ? await flowRes.json().catch(() => ({})) : { actions: [] }
  const portfolioJson = portfolioRes?.ok ? await portfolioRes.json().catch(() => ({})) : {}
  const actions: Array<{
    homeId: string
    homeAddress: string
    taskName: string
    isOverdue: boolean
    slackWorkingDays?: number | null
    actionDate: string
  }> = flowJson.actions ?? []
  const statusCounts = portfolioJson.statusCounts ?? {
    notStarted: 0,
    onTrack: 0,
    atRisk: 0,
    behind: 0,
  }
  const activeHomesCount = portfolioJson.activeHomesCount ?? 0

  const overdue = actions.filter((a) => a.isOverdue)
  const atRiskOrBehind = [...overdue]
  const uniqueByHome = Array.from(
    new Map(atRiskOrBehind.map((a) => [a.homeId, a])).values()
  ).slice(0, 10)

  switch (readType) {
    case "needs_attention": {
      if (uniqueByHome.length === 0) {
        return {
          message: "No homes need immediate attention today. All Flow items are on track.",
          data: { items: [] },
        }
      }
      const lines = uniqueByHome.map((a) => {
        const behind = typeof a.slackWorkingDays === "number" && a.slackWorkingDays < 0
          ? ` (${Math.abs(a.slackWorkingDays)} days behind target)`
          : ""
        return `${a.homeAddress}: ${a.taskName}${a.isOverdue ? " — overdue." : ""}${behind}`
      })
      return {
        message: `${uniqueByHome.length} home(s) need attention:\n\n${lines.join("\n")}`,
        data: { items: uniqueByHome },
      }
    }
    case "schedule_upcoming": {
      const upcoming = actions
        .filter((a) => !a.isOverdue)
        .slice(0, 10)
        .map((a) => `${a.taskName} for ${a.homeAddress} (${a.actionDate})`)
      if (upcoming.length === 0) {
        return {
          message: "No upcoming tasks in today's Flow. Check the Flow or Calendar for future dates.",
          data: { items: [] },
        }
      }
      return {
        message: `Upcoming tasks:\n\n${upcoming.join("\n")}`,
        data: { items: upcoming },
      }
    }
    case "homes_behind": {
      const behind = actions.filter(
        (a) => a.isOverdue || (typeof a.slackWorkingDays === "number" && a.slackWorkingDays < 0)
      )
      const byHome = Array.from(new Map(behind.map((a) => [a.homeId, a])).values())
      if (byHome.length === 0) {
        return {
          message: "No homes are currently behind schedule.",
          data: { items: [] },
        }
      }
      const lines = byHome.map(
        (a) =>
          `${a.homeAddress}: ${a.taskName}${typeof a.slackWorkingDays === "number" && a.slackWorkingDays < 0 ? ` — ${Math.abs(a.slackWorkingDays)} working days behind` : " — overdue"}`
      )
      return {
        message: `${byHome.length} home(s) behind:\n\n${lines.join("\n")}`,
        data: { items: byHome },
      }
    }
    case "why_delayed": {
      if (!addressFragment) {
        return {
          message: "Which home do you mean? Try: \"Why is 644 Paseo de la Reina behind?\"",
          data: {},
        }
      }
      const { prisma } = await import("@/lib/prisma")
      const allowedHomeIds = await getAllowedHomeIds(ctx.companyId, ctx.userId, ctx.role)
      const home = await resolveHome(
        { companyId: ctx.companyId, allowedHomeIds },
        addressFragment
      )
      if (!home) {
        return {
          message: `I couldn't find a home matching "${addressFragment}". Check the address and try again.`,
          data: {},
        }
      }
      const homeActions = actions.filter((a) => a.homeId === home.id)
      const overdueForHome = homeActions.filter((a) => a.isOverdue || (typeof a.slackWorkingDays === "number" && a.slackWorkingDays < 0))
      if (overdueForHome.length === 0) {
        return {
          message: `${home.addressOrLot} is not currently flagged as behind. It may be on track or at risk. Check the Flow for details.`,
          data: { homeId: home.id },
        }
      }
      const first = overdueForHome[0]
      const slack = typeof first.slackWorkingDays === "number" && first.slackWorkingDays < 0
        ? `${Math.abs(first.slackWorkingDays)} working days behind target.`
        : "overdue on today's Flow."
      return {
        message: `${home.addressOrLot} is behind because ${first.taskName} is ${slack}`,
        data: { homeId: home.id, taskName: first.taskName },
      }
    }
    case "homes_finishing_month": {
      const thisMonth = new Date().getMonth()
      const thisYear = new Date().getFullYear()
      const { prisma } = await import("@/lib/prisma")
      const allowedHomeIds = await getAllowedHomeIds(ctx.companyId, ctx.userId, ctx.role)
      if (allowedHomeIds.length === 0) {
        return { message: "No homes in your scope.", data: { items: [] } }
      }
      const homes = await prisma.home.findMany({
        where: {
          id: { in: allowedHomeIds },
          companyId: ctx.companyId,
          isComplete: false,
          forecastCompletionDate: { not: null },
        },
        select: { id: true, addressOrLot: true, forecastCompletionDate: true },
      })
      const finishing = homes.filter((h) => {
        const d = h.forecastCompletionDate
        if (!d) return false
        const dt = new Date(d)
        return dt.getMonth() === thisMonth && dt.getFullYear() === thisYear
      })
      if (finishing.length === 0) {
        return {
          message: "No homes are forecast to finish this month.",
          data: { items: [] },
        }
      }
      const lines = finishing.map(
        (h) =>
          `${h.addressOrLot} — forecast ${h.forecastCompletionDate ? new Date(h.forecastCompletionDate).toLocaleDateString() : "—"}`
      )
      return {
        message: `Homes forecast to finish this month:\n\n${lines.join("\n")}`,
        data: { items: finishing },
      }
    }
    case "materials_this_week": {
      const withOrdering = actions.filter(
        (a) => (a as { requiresOrdering?: boolean }).requiresOrdering
      )
      if (withOrdering.length === 0) {
        return {
          message: "No tasks requiring ordering are due this week in today's Flow. Check the Flow or Calendar for material needs.",
          data: { items: [] },
        }
      }
      const byHome = Array.from(
        new Map(withOrdering.map((a) => [`${a.homeId}-${a.taskName}`, a])).values()
      )
      const lines = byHome.map((a) => `${a.taskName} — ${a.homeAddress}`)
      return {
        message: `Tasks that may require materials this week:\n\n${lines.join("\n")}\n\nUse "Order [material] for [address]" to create a material request draft.`,
        data: { items: byHome },
      }
    }
    case "create_punchlist_help":
      return {
        message:
          "To create a punchlist, say: \"Create a punchlist for [address] with [item1], [item2]\". Example: Create a punchlist for 14409 Raywood with drywall touchup and cabinet adjustment.",
        data: {},
      }
    default:
      return {
        message:
          "I can help with: what needs attention today, schedule upcoming tasks, homes behind schedule, why a home is delayed, homes finishing this month, materials to order, or creating punchlists. Try a quick prompt or ask in your own words.",
        data: {},
      }
  }
}

export async function POST(request: NextRequest) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const ctx = await requireTenantContext()
    if (!["Admin", "Manager", "Superintendent"].includes(ctx.role)) {
      return NextResponse.json(
        { error: "Assistant is available only for Admin, Manager, and Superintendent." },
        { status: 403 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const message = typeof body.message === "string" ? body.message.trim() : ""
    if (!message) {
      return NextResponse.json({
        kind: "READ",
        message:
          "Ask about your schedule (e.g. what needs attention today, homes behind) or tell me what to do (e.g. schedule drywall for 652 Paseo next Tuesday).",
        data: {},
      } as AssistantInterpretResult)
    }

    const parsed = parseIntent(message)
    const allowedHomeIds = await getAllowedHomeIds(ctx.companyId, ctx.userId, ctx.role)
    const resolveCtx = { companyId: ctx.companyId, allowedHomeIds }

    if (parsed.kind === "READ" || parsed.kind === "RECOMMEND") {
      const addressFragment =
        parsed.read.type === "why_delayed" ? parsed.read.addressFragment : undefined
      const cookieHeader = request.headers.get("cookie") ?? ""
      const { message: msg, data } = await buildReadResponse(
        parsed.read.type === "unknown" ? "unknown" : parsed.read.type,
        addressFragment,
        ctx,
        cookieHeader
      )
      const result: AssistantInterpretResult = {
        kind: parsed.kind,
        message: msg,
        data,
      }
      return NextResponse.json(result)
    }

    const execute = parsed.execute
    if (execute.action === "schedule_task") {
      const home = await resolveHome(resolveCtx, execute.homeAddressFragment)
      if (!home) {
        return NextResponse.json({
          kind: "READ",
          message: `I couldn't find a home matching "${execute.homeAddressFragment}". Check the address.`,
          data: {},
        } as AssistantInterpretResult)
      }
      const task = await resolveTask(home.id, ctx.companyId, execute.taskNameFragment)
      if (!task) {
        return NextResponse.json({
          kind: "READ",
          message: `I couldn't find a task matching "${execute.taskNameFragment}" for ${home.addressOrLot}. Check the task name.`,
          data: {},
        } as AssistantInterpretResult)
      }
      const scheduledDate = parseRelativeDate(execute.dateFragment)
      if (!scheduledDate) {
        return NextResponse.json({
          kind: "READ",
          message: `I couldn't parse the date "${execute.dateFragment}". Try "next Tuesday", "Friday", or a specific date.`,
          data: {},
        } as AssistantInterpretResult)
      }
      const contractor = await resolveContractor(ctx.companyId, execute.contractorFragment)
      const preview: ScheduleTaskPreview = {
        type: "schedule_task",
        homeId: home.id,
        homeAddress: home.addressOrLot,
        taskId: task.id,
        taskName: task.nameSnapshot,
        scheduledDate: `${scheduledDate}T12:00:00.000Z`,
        contractorId: contractor?.id ?? null,
        contractorName: contractor?.companyName ?? null,
        smsConfirmation: true,
        validationWarnings: [],
      }
      const result: AssistantInterpretResult = {
        kind: "EXECUTE",
        action: "schedule_task",
        message: `Schedule **${task.nameSnapshot}** for ${home.addressOrLot} on ${new Date(preview.scheduledDate).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}${contractor ? ` with ${contractor.companyName}` : ""}. Approve to confirm.`,
        preview,
      }
      return NextResponse.json(result)
    }

    if (execute.action === "create_punchlist") {
      const home = await resolveHome(resolveCtx, execute.homeAddressFragment)
      if (!home) {
        return NextResponse.json({
          kind: "READ",
          message: `I couldn't find a home matching "${execute.homeAddressFragment}".`,
          data: {},
        } as AssistantInterpretResult)
      }
      const punchTask = await resolvePunchlistTask(home.id, ctx.companyId)
      if (!punchTask) {
        return NextResponse.json({
          kind: "READ",
          message: `No task found for punchlist on ${home.addressOrLot}. Add a task first.`,
          data: {},
        } as AssistantInterpretResult)
      }
      const items =
        (execute as CreatePunchlistIntent).items.length > 0
          ? (execute as CreatePunchlistIntent).items.map((title) => ({ title, description: undefined as string | undefined }))
          : [{ title: "Punchlist items to be added", description: undefined }]
      const dueDate = (execute as CreatePunchlistIntent).dueDateFragment
        ? parseRelativeDate((execute as CreatePunchlistIntent).dueDateFragment!)
        : null
      const preview: PunchlistPreview = {
        type: "create_punchlist",
        homeId: home.id,
        homeAddress: home.addressOrLot,
        taskId: punchTask.id,
        taskName: punchTask.nameSnapshot,
        items,
        dueDate,
        trade: (execute as CreatePunchlistIntent).tradeFragment ?? undefined,
      }
      const result: AssistantInterpretResult = {
        kind: "EXECUTE",
        action: "create_punchlist",
        message: `Create punchlist for **${home.addressOrLot}** (${items.length} item(s)) on task "${punchTask.nameSnapshot}". Approve to create.`,
        preview,
      }
      return NextResponse.json(result)
    }

    if (execute.action === "create_material_request") {
      const mat = execute as CreateMaterialRequestIntent
      let homeId: string | null = null
      let homeAddress: string | null = null
      if (mat.homeAddressFragment) {
        const home = await resolveHome(resolveCtx, mat.homeAddressFragment)
        if (home) {
          homeId = home.id
          homeAddress = home.addressOrLot
        }
      }
      const neededBy = mat.neededByFragment ? parseRelativeDate(mat.neededByFragment) : null
      const preview: MaterialRequestPreview = {
        type: "create_material_request",
        homeId,
        homeAddress,
        material: mat.materialFragment,
        quantity: mat.quantityFragment ?? "—",
        neededBy,
        vendor: null,
      }
      const result: AssistantInterpretResult = {
        kind: "EXECUTE",
        action: "create_material_request",
        message: `Create **material request draft**: ${mat.materialFragment}${homeAddress ? ` for ${homeAddress}` : ""}. This is a draft only; no purchase order will be submitted. Approve to save draft.`,
        preview,
      }
      return NextResponse.json(result)
    }

    return NextResponse.json({
      kind: "READ",
      message: "I didn't recognize that action. Try scheduling a task, creating a punchlist, or asking about the schedule.",
      data: {},
    } as AssistantInterpretResult)
  } catch (error) {
    return handleApiError(error)
  }
}
