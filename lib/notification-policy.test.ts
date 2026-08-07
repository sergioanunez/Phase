import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  mockFindFirst,
  mockUpdate,
  mockCreate,
  mockPunchFindMany,
  mockDispatchReply,
  mockDispatchPunch,
  mockDispatchReschedule,
} = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockUpdate: vi.fn(),
  mockCreate: vi.fn(),
  mockPunchFindMany: vi.fn(),
  mockDispatchReply: vi.fn(async () => undefined),
  mockDispatchPunch: vi.fn(async () => undefined),
  mockDispatchReschedule: vi.fn(async () => undefined),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    notification: {
      findFirst: mockFindFirst,
      update: mockUpdate,
      create: mockCreate,
    },
  },
}))

vi.mock("@/lib/web-push-dispatch", () => ({
  dispatchWebPushSubcontractorReply: mockDispatchReply,
  dispatchWebPushPunchlist: mockDispatchPunch,
  dispatchWebPushRescheduleRequest: mockDispatchReschedule,
}))

import {
  notifyTaskConfirmedByContractor,
  notifyTaskCompleted,
  notifyPunchItemsAddedToTask,
  notifyPunchItemCompleted,
  notifyTaskScheduled,
  notifyTaskRescheduled,
  notifyPunchListCompletedByContractor,
  notifyTaskRescheduleRequestedByContractor,
  taskRescheduleRequestEntityId,
} from "@/lib/notificationRules"
import {
  maybeNotifyPunchListCompleteAfterContractorReport,
  notifyTenantTaskReportedComplete,
} from "@/lib/notify-reported-complete"

describe("notification policy — retained contractor events", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindFirst.mockResolvedValue(null)
    mockCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "n1",
      ...data,
    }))
    mockUpdate.mockResolvedValue({ id: "n1" })
  })

  it("creates one Task confirmed notification for contractor confirm", async () => {
    await notifyTaskConfirmedByContractor({
      companyId: "co-1",
      homeId: "home-1",
      taskId: "task-1",
      taskName: "Plumbing Rough",
      homeLabel: "14512 Burwood Circle",
      contractorName: "Carrete Plumbing",
      confirmed: true,
    })

    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(mockCreate.mock.calls[0][0].data).toMatchObject({
      companyId: "co-1",
      title: "Task confirmed",
      message:
        "Carrete Plumbing confirmed Plumbing Rough at 14512 Burwood Circle.",
      entityType: "TASK",
      entityId: "task-1",
      category: "CONTRACTOR",
    })
    expect(mockDispatchReply).toHaveBeenCalledTimes(1)
  })

  it("creates one Reschedule requested notification for contractor unavailable", async () => {
    await notifyTaskRescheduleRequestedByContractor({
      companyId: "co-1",
      homeId: "home-1",
      taskId: "task-1",
      taskName: "Plumbing Rough",
      homeLabel: "14512 Burwood Circle",
      contractorName: "Carrete Plumbing",
      rescheduleRequestId: "task-1",
    })

    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(mockCreate.mock.calls[0][0].data).toMatchObject({
      title: "Reschedule requested",
      message:
        "Carrete Plumbing requested a new date for Plumbing Rough at 14512 Burwood Circle.",
      entityId: taskRescheduleRequestEntityId("task-1"),
      severity: "ATTENTION",
      requiresAction: true,
      category: "CONTRACTOR",
    })
    expect(mockDispatchReschedule).toHaveBeenCalledTimes(1)
  })

  it("includes proposed date in reschedule request message when provided", async () => {
    await notifyTaskRescheduleRequestedByContractor({
      companyId: "co-1",
      homeId: "home-1",
      taskId: "task-1",
      taskName: "Plumbing Rough",
      homeLabel: "14512 Burwood Circle",
      contractorName: "Carrete Plumbing",
      proposedDate: "2026-08-12T12:00:00.000Z",
      rescheduleRequestId: "req-9",
    })

    expect(mockCreate.mock.calls[0][0].data.message).toMatch(
      /Carrete Plumbing requested .+ for Plumbing Rough at 14512 Burwood Circle\./
    )
    expect(mockCreate.mock.calls[0][0].data.entityId).toBe(
      taskRescheduleRequestEntityId("req-9")
    )
  })

  it("does not duplicate reschedule request on replay (unresolved upsert)", async () => {
    mockFindFirst.mockResolvedValue({
      id: "existing-rr",
      homeId: "home-1",
      requiresAction: true,
      expiresAt: null,
    })

    await notifyTaskRescheduleRequestedByContractor({
      companyId: "co-1",
      homeId: "home-1",
      taskId: "task-1",
      taskName: "Plumbing Rough",
      homeLabel: "14512 Burwood Circle",
      contractorName: "Carrete Plumbing",
      rescheduleRequestId: "task-1",
    })

    expect(mockCreate).not.toHaveBeenCalled()
    expect(mockUpdate).toHaveBeenCalledTimes(1)
  })

  it("does not duplicate on confirmation replay (unresolved upsert)", async () => {
    mockFindFirst.mockResolvedValue({
      id: "existing",
      homeId: "home-1",
      requiresAction: false,
      expiresAt: null,
    })

    await notifyTaskConfirmedByContractor({
      companyId: "co-1",
      homeId: "home-1",
      taskId: "task-1",
      taskName: "Plumbing Rough",
      homeLabel: "14512 Burwood Circle",
      contractorName: "Carrete Plumbing",
      confirmed: true,
    })

    expect(mockCreate).not.toHaveBeenCalled()
    expect(mockUpdate).toHaveBeenCalledTimes(1)
  })

  it("creates one Punch list completed notification", async () => {
    await notifyPunchListCompletedByContractor({
      companyId: "co-1",
      homeId: "home-1",
      punchListKey: "list-1",
      taskId: "task-1",
      homeLabel: "14449 Leyland Parkway",
      contractorName: "Haskins Electric",
    })

    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(mockCreate.mock.calls[0][0].data).toMatchObject({
      title: "Punch list completed",
      entityId: "list-1",
    })
  })

  it("scopes create to the provided companyId (tenant)", async () => {
    await notifyTaskConfirmedByContractor({
      companyId: "tenant-a",
      homeId: "home-1",
      taskId: "task-1",
      taskName: "Framing",
      homeLabel: "Lot 1",
      contractorName: "Builder Co",
      confirmed: true,
    })
    expect(mockCreate.mock.calls[0][0].data.companyId).toBe("tenant-a")
  })
})

describe("notification policy — suppressed internal / noisy events", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("does not notify on internal task complete", async () => {
    await notifyTaskCompleted({
      companyId: "co-1",
      homeId: "h",
      taskId: "t",
      taskName: "X",
      homeLabel: "Y",
    })
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it("does not notify on internal task reschedule", async () => {
    await notifyTaskRescheduled({
      companyId: "co-1",
      homeId: "h",
      taskId: "t",
      taskName: "X",
      homeLabel: "Y",
    })
    expect(mockCreate).not.toHaveBeenCalled()
    expect(mockDispatchReschedule).not.toHaveBeenCalled()
  })

  it("does not notify on punch items created", async () => {
    await notifyPunchItemsAddedToTask({
      companyId: "co-1",
      homeId: "h",
      taskId: "t",
      taskName: "QC",
      homeLabel: "Y",
      punchCount: 3,
    })
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it("does not notify on internal punch item complete", async () => {
    await notifyPunchItemCompleted({
      companyId: "co-1",
      homeId: "h",
      taskId: "t",
      taskName: "QC",
      homeLabel: "Y",
      punchItemId: "p1",
      punchTitle: "Fix sensor",
    })
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it("does not notify on task scheduled", async () => {
    await notifyTaskScheduled({
      companyId: "co-1",
      homeId: "h",
      taskId: "t",
      taskName: "X",
      homeLabel: "Y",
      scheduledDate: new Date(),
    })
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it("does not notify on contractor task report-complete", async () => {
    await notifyTenantTaskReportedComplete({
      prisma: {} as never,
      companyId: "co-1",
      homeId: "h",
      taskId: "t",
      taskName: "X",
      address: "Y",
      contractorLabel: "C",
      reportingUserName: "Bob",
    })
    expect(mockCreate).not.toHaveBeenCalled()
  })
})

describe("maybeNotifyPunchListCompleteAfterContractorReport", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindFirst.mockResolvedValue(null)
    mockCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "n1",
      ...data,
    }))
  })

  it("does not notify until all list items are reported/closed", async () => {
    mockPunchFindMany.mockResolvedValue([
      { id: "1", status: "Open", reportedCompleteAt: new Date() },
      { id: "2", status: "Open", reportedCompleteAt: null },
    ])
    const prisma = { punchItem: { findMany: mockPunchFindMany } }

    await maybeNotifyPunchListCompleteAfterContractorReport({
      prisma: prisma as never,
      companyId: "co-1",
      homeId: "home-1",
      homeLabel: "14449 Leyland Parkway",
      contractorLabel: "Haskins Electric",
      punchListId: "list-1",
      relatedHomeTaskId: "task-1",
      assignedContractorId: "c1",
    })

    expect(mockCreate).not.toHaveBeenCalled()
  })

  it("notifies once when all items on the list are done", async () => {
    mockPunchFindMany.mockResolvedValue([
      { id: "1", status: "Open", reportedCompleteAt: new Date() },
      { id: "2", status: "Closed", reportedCompleteAt: null },
    ])
    const prisma = { punchItem: { findMany: mockPunchFindMany } }

    await maybeNotifyPunchListCompleteAfterContractorReport({
      prisma: prisma as never,
      companyId: "co-1",
      homeId: "home-1",
      homeLabel: "14449 Leyland Parkway",
      contractorLabel: "Haskins Electric",
      punchListId: "list-1",
      relatedHomeTaskId: "task-1",
      assignedContractorId: "c1",
    })

    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(mockCreate.mock.calls[0][0].data.entityId).toBe("list-1")
  })
})
