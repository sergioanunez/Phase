export const DEFAULT_PHASE_BRAND_COLOR = "#ffffff"

type TenantLike = {
  whiteLabelEnabled?: boolean
  brandPrimaryColor?: string | null
} | null | undefined

const HEX_6_RE = /^#([0-9A-Fa-f]{6})$/

export function getTenantBrandColor(tenant: TenantLike): string {
  if (tenant?.whiteLabelEnabled && tenant.brandPrimaryColor && HEX_6_RE.test(tenant.brandPrimaryColor)) {
    return tenant.brandPrimaryColor
  }
  // Default Phase experience: effectively "no belt" on white header
  return DEFAULT_PHASE_BRAND_COLOR
}

