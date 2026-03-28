import { render, screen, waitFor } from "@testing-library/react"
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest"
import StartTrialPage from "./page"

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: vi.fn(),
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}))

vi.mock("next-auth/react", () => ({
  signIn: vi.fn(),
}))

describe("StartTrialPage SMS consent", () => {
  beforeEach(() => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      json: async () => ({ user: null }),
    } as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("renders SMS consent checkbox unchecked by default", async () => {
    render(<StartTrialPage />)

    const checkbox = await waitFor(() =>
      screen.getByRole("checkbox", {
        name: /I agree to receive SMS notifications related to scheduling, task confirmations, and operational updates/i,
      })
    )

    expect((checkbox as HTMLInputElement).checked).toBe(false)
  })
})

