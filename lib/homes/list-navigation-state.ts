const STORAGE_KEY = "phase:homes-list-state"

export type HomesListNavigationState = {
  openSubdivisions: string[]
  scrollY: number
  searchQuery: string
  homeId?: string
}

export function saveHomesListNavigationState(state: HomesListNavigationState): void {
  if (typeof window === "undefined") return
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore quota / private mode
  }
}

export function loadHomesListNavigationState(): HomesListNavigationState | null {
  if (typeof window === "undefined") return null
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as HomesListNavigationState
    if (!parsed || !Array.isArray(parsed.openSubdivisions)) return null
    return {
      openSubdivisions: parsed.openSubdivisions,
      scrollY: typeof parsed.scrollY === "number" ? parsed.scrollY : 0,
      searchQuery: typeof parsed.searchQuery === "string" ? parsed.searchQuery : "",
      homeId: typeof parsed.homeId === "string" ? parsed.homeId : undefined,
    }
  } catch {
    return null
  }
}

export function homesListRestoreHref(): string {
  return "/homes?restore=1"
}
