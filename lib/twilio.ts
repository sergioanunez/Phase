import twilio from "twilio"
import { prisma } from "./prisma"
import { generateConfirmationCode } from "./utils"
import { TaskStatus, PricingTier } from "@prisma/client"

let _client: ReturnType<typeof twilio> | null = null

function getClient(): ReturnType<typeof twilio> {
  if (_client == null) {
    const sid = process.env.TWILIO_ACCOUNT_SID
    const token = process.env.TWILIO_AUTH_TOKEN
    if (!sid || !token) {
      throw new Error("Twilio credentials are not configured")
    }
    _client = twilio(sid, token)
  }
  return _client
}

/** Default "Phase"; for WHITE_LABEL tier use company brand name. */
async function getSmsSenderName(companyId: string | null): Promise<string> {
  if (!companyId) return "Phase"
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { pricingTier: true, brandAppName: true, name: true },
  })
  if (!company) return "Phase"
  if (company.pricingTier === PricingTier.WHITE_LABEL) {
    return company.brandAppName?.trim() || company.name
  }
  return "Phase"
}

export async function sendConfirmationSMS(
  homeTaskId: string,
  to: string,
  subdivision: string,
  home: string,
  task: string,
  date: string
): Promise<string> {
  // Validate Twilio client is configured
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    throw new Error("Twilio credentials are not configured")
  }

  if (!process.env.TWILIO_PHONE_NUMBER) {
    throw new Error("Twilio phone number is not configured")
  }

  // Normalize phone number to E.164 format if needed
  let normalizedTo = to.replace(/\D/g, "") // Remove all non-digits
  if (!normalizedTo.startsWith("+")) {
    // If no country code, assume US (+1)
    if (normalizedTo.length === 10) {
      normalizedTo = `+1${normalizedTo}`
    } else if (normalizedTo.length === 11 && normalizedTo.startsWith("1")) {
      normalizedTo = `+${normalizedTo}`
    } else {
      throw new Error(`Invalid phone number format: ${to}. Please use E.164 format (e.g., +1234567890)`)
    }
  }

  const confirmationCode = generateConfirmationCode()
  const taskRow = await prisma.homeTask.findUnique({
    where: { id: homeTaskId },
    select: { companyId: true },
  })
  const senderName = await getSmsSenderName(taskRow?.companyId ?? null)

  const message = `${senderName}:
Please confirm (Y/N):
${subdivision} ${home} – ${task} on ${date}
Reply Y or N
Code:${confirmationCode}`

  try {
    const twilioMessage = await getClient().messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER!,
      to: normalizedTo,
    })

    // Store outbound SMS
    await prisma.smsMessage.create({
      data: {
        direction: "Outbound",
        to: normalizedTo,
        from: process.env.TWILIO_PHONE_NUMBER!,
        body: message,
        status: "Sent",
        homeTaskId: homeTaskId,
        confirmationCode: confirmationCode,
      },
    })

    // Update task status
    await prisma.homeTask.update({
      where: { id: homeTaskId },
      data: {
        status: "PendingConfirm",
        lastConfirmationAt: new Date(),
      },
    })

    return confirmationCode
  } catch (error) {
    console.error("Failed to send SMS:", error)
    
    // Store failed SMS
    await prisma.smsMessage.create({
      data: {
        direction: "Outbound",
        to: normalizedTo,
        from: process.env.TWILIO_PHONE_NUMBER!,
        body: message,
        status: "Failed",
        homeTaskId: homeTaskId,
        confirmationCode: confirmationCode,
      },
    })

    // Re-throw with more context
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorCode = (error as any)?.code
    throw new Error(errorCode ? `Twilio error ${errorCode}: ${errorMessage}` : errorMessage)
  }
}

export async function sendCancellationSMS(
  homeTaskId: string,
  to: string,
  subdivision: string,
  home: string,
  task: string,
  date: string
): Promise<void> {
  // Validate Twilio client is configured
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    throw new Error("Twilio credentials are not configured")
  }

  if (!process.env.TWILIO_PHONE_NUMBER) {
    throw new Error("Twilio phone number is not configured")
  }

  // Normalize phone number to E.164 format if needed
  let normalizedTo = to.replace(/\D/g, "") // Remove all non-digits
  if (!normalizedTo.startsWith("+")) {
    // If no country code, assume US (+1)
    if (normalizedTo.length === 10) {
      normalizedTo = `+1${normalizedTo}`
    } else if (normalizedTo.length === 11 && normalizedTo.startsWith("1")) {
      normalizedTo = `+${normalizedTo}`
    } else {
      throw new Error(`Invalid phone number format: ${to}. Please use E.164 format (e.g., +1234567890)`)
    }
  }

  const taskForSender = await prisma.homeTask.findUnique({
    where: { id: homeTaskId },
    select: { companyId: true },
  })
  const senderName = await getSmsSenderName(taskForSender?.companyId ?? null)

  const message = `${senderName}:
CANCELLED: ${subdivision} ${home} – ${task} scheduled for ${date} has been cancelled.
We apologize for any inconvenience.`

  try {
    const twilioMessage = await getClient().messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER!,
      to: normalizedTo,
    })

    // Store outbound SMS
    await prisma.smsMessage.create({
      data: {
        direction: "Outbound",
        to: normalizedTo,
        from: process.env.TWILIO_PHONE_NUMBER!,
        body: message,
        status: "Sent",
        homeTaskId: homeTaskId,
      },
    })
  } catch (error) {
    console.error("Failed to send cancellation SMS:", error)
    
    // Store failed SMS
    await prisma.smsMessage.create({
      data: {
        direction: "Outbound",
        to: normalizedTo,
        from: process.env.TWILIO_PHONE_NUMBER!,
        body: message,
        status: "Failed",
        homeTaskId: homeTaskId,
      },
    })

    // Re-throw with more context
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorCode = (error as any)?.code
    throw new Error(errorCode ? `Twilio error ${errorCode}: ${errorMessage}` : errorMessage)
  }
}

export async function handleInboundSMS(
  from: string,
  to: string,
  body: string
) {
  const normalizedFrom = from.replace(/\D/g, "")
  const normalizedTo = to.replace(/\D/g, "")

  // Store inbound SMS
  const smsMessage = await prisma.smsMessage.create({
    data: {
      direction: "Inbound",
      to: normalizedTo,
      from: normalizedFrom,
      body: body,
      status: "Received",
    },
  })

  // Try to extract confirmation code
  const codeMatch = body.match(/[Cc]ode:\s*(\w+)/i)
  const confirmationCode = codeMatch ? codeMatch[1].toUpperCase() : null

  // Find task by confirmation code (primary method)
  let homeTask = confirmationCode
    ? await prisma.homeTask.findFirst({
        where: {
          status: "PendingConfirm",
          smsMessages: {
            some: {
              confirmationCode: confirmationCode,
              direction: "Outbound",
            },
          },
        },
        include: {
          contractor: true,
          home: {
            include: {
              subdivision: true,
            },
          },
        },
      })
    : null

  // Fallback: find latest PendingConfirm task for this phone number
  if (!homeTask) {
    const contractor = await prisma.contractor.findFirst({
      where: {
        phone: {
          contains: normalizedFrom,
        },
      },
    })

    if (contractor) {
      homeTask = await prisma.homeTask.findFirst({
        where: {
          contractorId: contractor.id,
          status: "PendingConfirm",
        },
        orderBy: {
          lastConfirmationAt: "desc",
        },
        include: {
          contractor: true,
          home: {
            include: {
              subdivision: true,
            },
          },
        },
      })
    }
  }

  if (!homeTask) {
    return { processed: false, reason: "No matching task found" }
  }

  // Link SMS to task
  await prisma.smsMessage.update({
    where: { id: smsMessage.id },
    data: { homeTaskId: homeTask.id },
  })

  // Parse response
  const response = body.trim().toUpperCase()
  const isYes = response === "Y" || response.startsWith("YES")
  const isNo = response === "N" || response.startsWith("NO")

  if (isYes) {
    await prisma.homeTask.update({
      where: { id: homeTask.id },
      data: { status: "Confirmed" },
    })
    return { processed: true, action: "confirmed", taskId: homeTask.id }
  } else if (isNo) {
    await prisma.homeTask.update({
      where: { id: homeTask.id },
      data: { status: "Declined" },
    })
    return { processed: true, action: "declined", taskId: homeTask.id }
  }

  return { processed: false, reason: "Invalid response format" }
}

export async function sendPunchListSMS(
  taskId: string,
  to: string,
  subdivision: string,
  home: string,
  task: string,
  punchItems: Array<{ title: string; dueDate: string | null; photoUrls?: string[] }>
): Promise<void> {
  // Validate Twilio client is configured
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    throw new Error("Twilio credentials are not configured")
  }

  if (!process.env.TWILIO_PHONE_NUMBER) {
    throw new Error("Twilio phone number is not configured")
  }

  // Normalize phone number to E.164 format if needed
  let normalizedTo = to.replace(/\D/g, "") // Remove all non-digits
  if (!normalizedTo.startsWith("+")) {
    // If no country code, assume US (+1)
    if (normalizedTo.length === 10) {
      normalizedTo = `+1${normalizedTo}`
    } else if (normalizedTo.length === 11 && normalizedTo.startsWith("1")) {
      normalizedTo = `+${normalizedTo}`
    } else {
      throw new Error(`Invalid phone number format: ${to}. Please use E.164 format (e.g., +1234567890)`)
    }
  }

  const taskForSender = await prisma.homeTask.findUnique({
    where: { id: taskId },
    select: { companyId: true },
  })
  const senderName = await getSmsSenderName(taskForSender?.companyId ?? null)

  // Format punch items list
  const itemsList = punchItems
    .map((item, index) => {
      const dueDateText = item.dueDate
        ? ` (Due: ${new Date(item.dueDate).toLocaleDateString()})`
        : ""
      return `${index + 1}. ${item.title}${dueDateText}`
    })
    .join("\n")

  const message = `${senderName} - Punch List:
${subdivision} ${home} – ${task}

Punch Items:
${itemsList}

Please address these items.`

  try {
    const twilioMessage = await getClient().messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER!,
      to: normalizedTo,
    })

    // Store outbound SMS
    await prisma.smsMessage.create({
      data: {
        direction: "Outbound",
        to: normalizedTo,
        from: process.env.TWILIO_PHONE_NUMBER!,
        body: message,
        status: "Sent",
        homeTaskId: taskId,
      },
    })
  } catch (error) {
    console.error("Failed to send punch list SMS:", error)
    
    // Store failed SMS
    await prisma.smsMessage.create({
      data: {
        direction: "Outbound",
        to: normalizedTo,
        from: process.env.TWILIO_PHONE_NUMBER!,
        body: message,
        status: "Failed",
        homeTaskId: taskId,
      },
    })

    // Re-throw with more context
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorCode = (error as any)?.code
    throw new Error(errorCode ? `Twilio error ${errorCode}: ${errorMessage}` : errorMessage)
  }
}
