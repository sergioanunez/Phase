import type { Prisma } from "@prisma/client"

/**
 * WorkTemplateItem.companyId is nullable; some rows may only be tied to the
 * tenant via WorkTemplateCategory. Use this for list queries so templates do
 * not disappear when companyId was never backfilled.
 */
export function workTemplateItemWhereForTenant(
  companyId: string
): Prisma.WorkTemplateItemWhereInput {
  return {
    OR: [{ companyId }, { workTemplateCategory: { is: { companyId } } }],
  }
}
