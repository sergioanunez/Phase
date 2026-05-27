import type { PrismaClient } from "@prisma/client"

type Db = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>

/**
 * Deletes a tenant and related rows in an order that satisfies FK constraints.
 * TemplateDependency → WorkTemplateItem uses RESTRICT (no onDelete cascade).
 */
export async function deleteCompanyAndRelatedData(
  tx: Db,
  companyId: string
): Promise<void> {
  const templateIds = (
    await tx.workTemplateItem.findMany({
      where: { companyId },
      select: { id: true },
    })
  ).map((t) => t.id)

  const templateDependencyWhere =
    templateIds.length > 0
      ? {
          OR: [
            { companyId },
            { templateItemId: { in: templateIds } },
            { dependsOnItemId: { in: templateIds } },
          ],
        }
      : { companyId }

  await tx.templateDependency.deleteMany({ where: templateDependencyWhere })

  const homeTaskWhere =
    templateIds.length > 0
      ? { OR: [{ companyId }, { templateItemId: { in: templateIds } }] }
      : { companyId }

  await tx.homeTask.deleteMany({ where: homeTaskWhere })

  if (templateIds.length > 0) {
    await tx.workTemplateItem.deleteMany({ where: { id: { in: templateIds } } })
  }

  await tx.workTemplateCategory.deleteMany({ where: { companyId } })

  await tx.company.delete({ where: { id: companyId } })
}
