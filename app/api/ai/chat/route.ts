import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import OpenAI from "openai"
import { TaskStatus } from "@prisma/client"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// AI tools based on user role
async function getHomes(filter: any, userId: string, role: string) {
  const where: any = {}
  if (filter.subdivisionId) where.subdivisionId = filter.subdivisionId

  if (role === "Superintendent") {
    const assignments = await prisma.homeAssignment.findMany({
      where: { superintendentUserId: userId },
      select: { homeId: true },
    })
    where.id = { in: assignments.map((a) => a.homeId) }
  }

  return await prisma.home.findMany({
    where,
    include: {
      subdivision: true,
      tasks: {
        select: {
          id: true,
          status: true,
          scheduledDate: true,
        },
      },
    },
  })
}

async function getHomeDetails(homeId: string, userId: string, role: string) {
  const home = await prisma.home.findUnique({
    where: { id: homeId },
    include: {
      subdivision: true,
      tasks: {
        include: {
          contractor: true,
          templateItem: true,
        },
        orderBy: { sortOrderSnapshot: "asc" },
      },
    },
  })

  if (!home) return null

  if (role === "Superintendent") {
    const hasAccess = await prisma.homeAssignment.findFirst({
      where: {
        homeId: home.id,
        superintendentUserId: userId,
      },
    })
    if (!hasAccess) return null
  }

  return home
}

async function getTasks(
  filters: {
    homeId?: string
    contractorId?: string
    status?: TaskStatus[]
    dateRange?: { start: string; end: string }
  },
  userId: string,
  role: string,
  contractorId?: string | null
) {
  const where: any = {}

  if (filters.homeId) where.homeId = filters.homeId
  if (filters.contractorId) where.contractorId = filters.contractorId
  if (filters.status) where.status = { in: filters.status }
  if (filters.dateRange) {
    where.scheduledDate = {
      gte: new Date(filters.dateRange.start),
      lte: new Date(filters.dateRange.end),
    }
  }

  // Subcontractor can only see their own tasks
  if (role === "Subcontractor") {
    if (!contractorId) return []
    where.contractorId = contractorId
  }

  return await prisma.homeTask.findMany({
    where,
    include: {
      home: {
        include: {
          subdivision: true,
        },
      },
      contractor: true,
    },
    orderBy: { scheduledDate: "asc" },
  })
}

async function summarizeDelays(userId: string, role: string) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const where: any = {
    status: { not: "Completed" },
    scheduledDate: { lt: today },
  }

  if (role === "Superintendent") {
    const assignments = await prisma.homeAssignment.findMany({
      where: { superintendentUserId: userId },
      select: { homeId: true },
    })
    where.homeId = { in: assignments.map((a) => a.homeId) }
  }

  const delayedTasks = await prisma.homeTask.findMany({
    where,
    include: {
      home: {
        include: {
          subdivision: true,
        },
      },
      contractor: true,
    },
  })

  return delayedTasks
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { messages } = await request.json()

    const tools = [
      {
        type: "function" as const,
        function: {
          name: "getHomes",
          description: "Get list of homes with optional filters",
          parameters: {
            type: "object",
            properties: {
              filter: {
                type: "object",
                properties: {
                  subdivisionId: { type: "string" },
                },
              },
            },
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "getHomeDetails",
          description: "Get detailed information about a specific home",
          parameters: {
            type: "object",
            properties: {
              homeId: { type: "string" },
            },
            required: ["homeId"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "getTasks",
          description: "Get tasks with filters (homeId, contractorId, status, dateRange)",
          parameters: {
            type: "object",
            properties: {
              filters: {
                type: "object",
                properties: {
                  homeId: { type: "string" },
                  contractorId: { type: "string" },
                  status: {
                    type: "array",
                    items: { type: "string" },
                  },
                  dateRange: {
                    type: "object",
                    properties: {
                      start: { type: "string" },
                      end: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "summarizeDelays",
          description: "Get all tasks that are behind schedule",
          parameters: {
            type: "object",
            properties: {},
          },
        },
      },
    ]

    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content: `You are a helpful assistant for Cullers Scheduling app. 
          The user has role: ${session.user.role}.
          ${session.user.role === "Subcontractor" ? "You can only access tasks assigned to this subcontractor." : ""}
          Always be concise and helpful. When proposing actions, remind the user they must confirm before execution.`,
        },
        ...messages,
      ],
      tools,
      tool_choice: "auto",
    })

    const message = completion.choices[0].message

    // Handle tool calls
    if (message.tool_calls) {
      const toolResults = await Promise.all(
        message.tool_calls.map(async (call) => {
          const args = JSON.parse(call.function.arguments)
          let result

          switch (call.function.name) {
            case "getHomes":
              result = await getHomes(
                args.filter || {},
                session.user.id,
                session.user.role
              )
              break
            case "getHomeDetails":
              result = await getHomeDetails(
                args.homeId,
                session.user.id,
                session.user.role
              )
              break
            case "getTasks":
              result = await getTasks(
                args.filters || {},
                session.user.id,
                session.user.role,
                session.user.contractorId
              )
              break
            case "summarizeDelays":
              result = await summarizeDelays(session.user.id, session.user.role)
              break
            default:
              result = { error: "Unknown tool" }
          }

          return {
            tool_call_id: call.id,
            role: "tool" as const,
            name: call.function.name,
            content: JSON.stringify(result),
          }
        })
      )

      // Get final response with tool results
      const finalCompletion = await openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          {
            role: "system",
            content: `You are a helpful assistant for Cullers Scheduling app. 
            The user has role: ${session.user.role}.`,
          },
          ...messages,
          message,
          ...toolResults,
        ],
      })

      return NextResponse.json({
        message: finalCompletion.choices[0].message,
      })
    }

    return NextResponse.json({ message })
  } catch (error: any) {
    console.error("AI chat error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to process AI request" },
      { status: 500 }
    )
  }
}
