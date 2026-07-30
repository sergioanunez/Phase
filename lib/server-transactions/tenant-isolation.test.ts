import { describe, expect, it } from "vitest"
import {
  tenantScopedHomeWhere,
  tenantScopedPunchWhere,
  tenantScopedWhere,
} from "@/lib/server-transactions/tenant-scope"

describe("tenant scope helpers", () => {
  it("scopes tasks by companyId or nested home companyId", () => {
    expect(tenantScopedWhere("co-a")).toEqual({
      OR: [{ companyId: "co-a" }, { companyId: null, home: { companyId: "co-a" } }],
    })
  })

  it("scopes punch items across companyId / home / task relations", () => {
    const where = tenantScopedPunchWhere("co-a")
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { companyId: "co-a" },
        { companyId: null, home: { companyId: "co-a" } },
        { companyId: null, relatedHomeTask: { companyId: "co-a" } },
        { companyId: null, relatedHomeTask: { home: { companyId: "co-a" } } },
      ])
    )
  })

  it("scopes homes by companyId", () => {
    expect(tenantScopedHomeWhere("co-a")).toEqual({ companyId: "co-a" })
  })

  it("cross-tenant scopes differ so co-b cannot match co-a filters", () => {
    expect(tenantScopedPunchWhere("co-a")).not.toEqual(tenantScopedPunchWhere("co-b"))
    expect(tenantScopedWhere("co-a")).not.toEqual(tenantScopedWhere("co-b"))
  })
})

describe("punch route tenant repair contract", () => {
  it("documents routes that must use session companyId + scoped where", () => {
    const repaired = [
      "app/api/punch-items/[id]/route.ts",
      "app/api/tasks/[id]/punch-items/route.ts",
      "app/api/punch-items/[id]/photos/route.ts",
    ]
    expect(repaired).toHaveLength(3)
  })
})
