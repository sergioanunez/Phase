import { listSubcontractorTenantsForUser } from "@/lib/subcontractor-tenants"

function effectiveCompanyId(task: {
  companyId: string | null
  home: { companyId: string | null }
}): string | null {
  return task.companyId ?? task.home.companyId
}

/**
 * Subcontractor may report on a task when their linked contractor row for that tenant matches the task's contractor.
 */
export async function canSubcontractorReportOnTask(
  userId: string,
  task: {
    contractorId: string | null
    companyId: string | null
    home: { companyId: string | null }
  }
): Promise<boolean> {
  if (!task.contractorId) return false
  const tenants = await listSubcontractorTenantsForUser(userId)
  const cid = effectiveCompanyId(task)
  if (!cid) return false
  return tenants.some((t) => t.companyId === cid && t.contractorId === task.contractorId)
}

export async function canSubcontractorReportOnPunch(
  userId: string,
  punch: {
    assignedContractorId: string | null
    companyId: string | null
    home: { companyId: string | null }
    relatedHomeTask: {
      contractorId: string | null
      companyId: string | null
      home: { companyId: string | null }
    }
  }
): Promise<boolean> {
  const contractorForPunch =
    punch.assignedContractorId ?? punch.relatedHomeTask.contractorId
  if (!contractorForPunch) return false
  const tenants = await listSubcontractorTenantsForUser(userId)
  const punchCompanyId = punch.companyId ?? punch.home.companyId
  if (!punchCompanyId) return false
  return tenants.some((t) => t.companyId === punchCompanyId && t.contractorId === contractorForPunch)
}
