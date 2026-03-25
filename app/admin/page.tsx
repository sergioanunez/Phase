"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CreateHomeDialog } from "@/components/create-home-dialog"
import { CreateSubdivisionDialog } from "@/components/create-subdivision-dialog"
import { CreateTemplateDialog } from "@/components/create-template-dialog"
import { ImportTemplatesDialog } from "@/components/import-templates-dialog"
import { ImportContractorsDialog } from "@/components/import-contractors-dialog"
import { CreateContractorDialog } from "@/components/create-contractor-dialog"
import { CreateUserDialog } from "@/components/create-user-dialog"
import { EditUserDialog } from "@/components/edit-user-dialog"
import { ImportHomesDialog } from "@/components/import-homes-dialog"
import { SettingsNav } from "@/components/settings-nav"
import { Plus, Trash2, Upload, Edit2, Check, X, ArrowLeft, ChevronRight, Lock, Settings, GitBranch, FileText, Mail, Palette, Search, FileSpreadsheet, GanttChart, Link2 } from "lucide-react"
import { TemplateSummaryCard } from "@/components/template-summary-card"
import { PlanViewer } from "@/components/plan-viewer"
import { format } from "date-fns"
import { useRef, useMemo } from "react"
import { sanitizeUrl } from "@/lib/url"
import { computeCategoryCriticalPathDuration } from "@/lib/scheduling/categoryDuration"
import { sortWorkTemplatesForDisplay } from "@/lib/work-template-display-order"
import {
  WorkTemplateCategorySortableCard,
  WorkTemplateCategorySortableSection,
  WorkTemplateItemsDndContext,
  WorkTemplateItemSortableRow,
} from "@/components/work-template-dnd"

interface Subdivision {
  id: string
  name: string
  homes: Array<{
    id: string
    addressOrLot: string
  }>
}

interface Home {
  id: string
  addressOrLot: string
  startDate: string | null
  targetCompletionDate: string | null
  hasPlan?: boolean
  hasThumbnail?: boolean
  thumbnailFileName?: string | null
  planName?: string | null
  planFileName?: string | null
  planVariant?: string | null
  planFileType?: string | null
  planUploadedAt?: string | null
  subdivision: {
    id: string
    name: string
  }
}

interface WorkTemplateCategoryRow {
  id: string
  name: string
  categoryPosition: number
  itemCount: number
  createdAt?: string
  updatedAt?: string
}

interface WorkTemplateItem {
  id: string
  name: string
  defaultDurationDays: number
  sortOrder: number
  sequenceOrder?: number | null
  optionalCategory: string | null
  workTemplateCategoryId?: string | null
  itemPosition?: number | null
  workTemplateCategory?: { id: string; name: string; categoryPosition: number } | null
  isDependency: boolean
  isCriticalGate: boolean
  gateScope: "DownstreamOnly" | "AllScheduling"
  gateBlockMode: "ScheduleOnly" | "ScheduleAndConfirm"
  gateName: string | null
  prepLeadDays?: number
  requiresOrdering?: boolean
  materialLeadDays?: number
  contractorId?: string | null
  contractorLeadOverrideDays?: number | null
  contractor?: { id: string; companyName: string; trade: string | null; leadDays: number } | null
  dependencies?: Array<{
    dependsOnItemId: string
    dependsOnItem: {
      id: string
      name: string
    } | null
  }>
}

interface ContractorContact {
  id: string
  name: string
  email: string
  status?: string
  phoneE164?: string | null
  smsConsent?: boolean
  smsOptOutAt?: string | null
}

interface Contractor {
  id: string
  companyName: string
  contactName: string
  phone: string
  email: string | null
  trade: string | null
  preferredNoticeDays: number | null
  leadDays?: number
  defaultContactId?: string | null
  defaultContact?: { id: string; name: string; email: string } | null
  users?: ContractorContact[]
}

interface AdminUser {
  id: string
  name: string
  email: string
  role: "Admin" | "Superintendent" | "Manager" | "Subcontractor"
  contractorId: string | null
  isActive: boolean
  status?: "INVITED" | "ACTIVE" | "DISABLED"
  contractor?: { id: string; companyName: string } | null
  /** Set when contact accepts invite with SMS consent; used for confirmation texts (never office number). */
  phoneE164?: string | null
}

interface CompanyBranding {
  pricingTier: string
  name: string
  brandAppName: string | null
  brandLogoUrl: string | null
  brandLogoPath: string | null
  brandFaviconPath: string | null
  logoUrl: string | null
  faviconUrl: string | null
  brandPrimaryColor: string | null
  brandAccentColor: string | null
  brandingUpdatedAt?: string
}

export default function AdminPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const settingsTab = searchParams.get("tab") || "subdivisions-homes"
  const [subdivisions, setSubdivisions] = useState<Subdivision[]>([])
  const [homes, setHomes] = useState<Home[]>([])
  const [templates, setTemplates] = useState<WorkTemplateItem[]>([])
  const [contractors, setContractors] = useState<Contractor[]>([])
  const [users, setUsers] = useState<AdminUser[]>([])
  const [categoryGates, setCategoryGates] = useState<Array<{ categoryName: string; gateName: string | null; gateScope: string; gateBlockMode: string }>>([])
  const [loading, setLoading] = useState(true)
  const [createHomeOpen, setCreateHomeOpen] = useState(false)
  const [createSubdivisionOpen, setCreateSubdivisionOpen] = useState(false)
  const [createTemplateOpen, setCreateTemplateOpen] = useState(false)
  const [importTemplatesOpen, setImportTemplatesOpen] = useState(false)
  const [createContractorOpen, setCreateContractorOpen] = useState(false)
  const [importContractorsOpen, setImportContractorsOpen] = useState(false)
  const [createUserOpen, setCreateUserOpen] = useState(false)
  const [editUserOpen, setEditUserOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null)
  const [inviteContactVendorId, setInviteContactVendorId] = useState<string | null>(null)
  const [inviteContactOpen, setInviteContactOpen] = useState(false)
  const [inviteContactName, setInviteContactName] = useState("")
  const [inviteContactEmail, setInviteContactEmail] = useState("")
  const [inviteContactLoading, setInviteContactLoading] = useState(false)
  const [inviteContactError, setInviteContactError] = useState("")
  const [subSearchOpen, setSubSearchOpen] = useState(false)
  const [subSearchQuery, setSubSearchQuery] = useState("")
  const [subSearchResults, setSubSearchResults] = useState<
    Array<{
      contractorDirectoryId: string
      displayName: string
      companyName: string | null
      maskedEmail: string | null
      maskedPhone: string | null
      alreadyLinkedToTenant: boolean
      hasUserAccount: boolean
    }>
  >([])
  const [subSearchLoading, setSubSearchLoading] = useState(false)
  const [subSearchError, setSubSearchError] = useState<string | null>(null)
  const [refreshSubdivisions, setRefreshSubdivisions] = useState(0)
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
  const [editingTemplateName, setEditingTemplateName] = useState("")
  const [editingTemplateDuration, setEditingTemplateDuration] = useState("")
  const [editingTemplateOrder, setEditingTemplateOrder] = useState("")
  const [editingTemplateCategory, setEditingTemplateCategory] = useState("")
  const [editingTemplateRequiresOrdering, setEditingTemplateRequiresOrdering] = useState(false)
  const [editingTemplateMaterialLeadDays, setEditingTemplateMaterialLeadDays] = useState("")
  const [editingTemplateContractorId, setEditingTemplateContractorId] = useState("")
  const [editingTemplateContractorLeadOverrideDays, setEditingTemplateContractorLeadOverrideDays] = useState("")
  const [showTemplateAdvanced, setShowTemplateAdvanced] = useState(false)
  const [editingGateTemplateId, setEditingGateTemplateId] = useState<string | null>(null)
  const [editingGateName, setEditingGateName] = useState("")
  const [editingGateScope, setEditingGateScope] = useState<"DownstreamOnly" | "AllScheduling">("DownstreamOnly")
  const [editingGateBlockMode, setEditingGateBlockMode] = useState<"ScheduleOnly" | "ScheduleAndConfirm">("ScheduleOnly")
  const [editingDepsTemplateId, setEditingDepsTemplateId] = useState<string | null>(null)
  const [editingDepsSelectedIds, setEditingDepsSelectedIds] = useState<string[]>([])
  const [editingDepsLoading, setEditingDepsLoading] = useState(false)
  const [selectedSubdivisionId, setSelectedSubdivisionId] = useState<string | null>(null)
  const [editingSubdivisionId, setEditingSubdivisionId] = useState<string | null>(null)
  const [editingSubdivisionName, setEditingSubdivisionName] = useState("")
  const [editingHomeId, setEditingHomeId] = useState<string | null>(null)
  const [editingHomeAddress, setEditingHomeAddress] = useState("")
  const [editingHomeStartDate, setEditingHomeStartDate] = useState("")
  const [editingHomeTargetDate, setEditingHomeTargetDate] = useState("")
  const [editingPlanName, setEditingPlanName] = useState("")
  const [editingPlanVariant, setEditingPlanVariant] = useState("")
  const [planUploading, setPlanUploading] = useState(false)
  const [planDeleting, setPlanDeleting] = useState(false)
  const [planViewerOpen, setPlanViewerOpen] = useState(false)
  const [planViewerHome, setPlanViewerHome] = useState<Home | null>(null)
  const planFileInputRef = useRef<HTMLInputElement>(null)
  const thumbnailFileInputRef = useRef<HTMLInputElement>(null)
  const [thumbnailUploading, setThumbnailUploading] = useState(false)
  const [thumbnailDeleting, setThumbnailDeleting] = useState(false)
  const [importHomesOpen, setImportHomesOpen] = useState(false)
  const [resendInviteUserId, setResendInviteUserId] = useState<string | null>(null)
  const resendInviteInProgressRef = useRef(false)
  const [manualInviteOpen, setManualInviteOpen] = useState(false)
  const [manualInviteLink, setManualInviteLink] = useState<string | null>(null)
  const [manualInviteMessage, setManualInviteMessage] = useState<string | null>(null)
  const [manualInviteError, setManualInviteError] = useState<string | null>(null)
  const [editingContractorId, setEditingContractorId] = useState<string | null>(null)
  const [editingContractor, setEditingContractor] = useState({
    companyName: "",
    contactName: "",
    phone: "",
    email: "",
    trade: "",
    preferredNoticeDays: "",
    leadDays: "",
  })
  const [companyBranding, setCompanyBranding] = useState<CompanyBranding | null>(null)
  const [brandForm, setBrandForm] = useState({
    brandAppName: "",
    brandPrimaryColor: "",
    brandAccentColor: "",
  })
  const [brandSaving, setBrandSaving] = useState(false)
  const [logoUploading, setLogoUploading] = useState(false)
  const [faviconUploading, setFaviconUploading] = useState(false)
  const logoFileInputRef = useRef<HTMLInputElement>(null)
  const faviconFileInputRef = useRef<HTMLInputElement>(null)
  const [assignedSuperintendentIds, setAssignedSuperintendentIds] = useState<string[]>([])
  const [assignmentsLoading, setAssignmentsLoading] = useState(false)
  const [assignmentsSaving, setAssignmentsSaving] = useState(false)
  const [impersonationRole, setImpersonationRole] = useState<string | null>(null)
  const [impersonationChecked, setImpersonationChecked] = useState(false)
  const [workTemplatesSearchQuery, setWorkTemplatesSearchQuery] = useState("")
  const [criticalTemplateIds, setCriticalTemplateIds] = useState<string[]>([])
  const [templateCategoryRows, setTemplateCategoryRows] = useState<WorkTemplateCategoryRow[]>([])
  const [createTemplateCategoryId, setCreateTemplateCategoryId] = useState<string | null>(null)
  const [newCategoryOpen, setNewCategoryOpen] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState("")
  const [newCategorySaving, setNewCategorySaving] = useState(false)
  const [editCategoryRow, setEditCategoryRow] = useState<WorkTemplateCategoryRow | null>(null)
  const [editCategoryName, setEditCategoryName] = useState("")
  const [editCategorySaving, setEditCategorySaving] = useState(false)

  async function handleSubSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    const q = subSearchQuery.trim()
    if (!q) return
    setSubSearchLoading(true)
    setSubSearchError(null)
    try {
      const res = await fetch(`/api/admin/subcontractors/search?query=${encodeURIComponent(q)}`)
      const data = await res.json()
      if (!res.ok) {
        setSubSearchError(data?.error || "Search failed")
        setSubSearchResults([])
        return
      }
      setSubSearchResults(Array.isArray(data.results) ? data.results : [])
    } catch (err: any) {
      console.error("Subcontractor search error:", err)
      setSubSearchError("Search failed")
      setSubSearchResults([])
    } finally {
      setSubSearchLoading(false)
    }
  }

  async function handleLinkExistingSubcontractor(contractorDirectoryId: string) {
    try {
      const res = await fetch("/api/admin/subcontractors/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractorDirectoryId }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        alert(data?.error || "Failed to link subcontractor")
        return
      }
      if (data.mode === "linked-existing-user") {
        alert("Linked. Subcontractor was notified.")
      } else if (data.mode === "invited-new-user") {
        alert("Invite sent. Subcontractor will set their password and connect.")
      } else if (data.mode === "invite-blocked") {
        alert(data.error || "Cannot invite subcontractor. Check your plan limits.")
      } else if (data.mode === "email-already-in-use") {
        alert(data.error || "A user with this email already exists.")
      } else if (data.mode === "invite-email-failed") {
        alert(data.warning || "User was created but invite email failed. Check email logs.")
      } else {
        alert("Linked, but no user account found. You may need to invite them manually.")
      }
      // Refresh contractors list
      handleRefresh()
    } catch (err: any) {
      console.error("Link subcontractor error:", err)
      alert("Failed to link subcontractor")
    }
  }

  useEffect(() => {
    fetch("/api/super-admin/impersonation/context")
      .then((res) => res.json())
      .then((data) => {
        setImpersonationRole(data.active && data.role ? data.role : null)
        setImpersonationChecked(true)
      })
      .catch(() => setImpersonationChecked(true))
  }, [])

  useEffect(() => {
    if (!impersonationChecked || !session?.user) return
    const effectiveRole = impersonationRole ?? session.user.role
    if (effectiveRole !== "Admin") {
      router.push("/")
      return
    }

    Promise.all([
      fetch("/api/subdivisions").then(async (res) => {
        const data = await res.json()
        if (!res.ok) {
          console.error("Subdivisions API error:", data)
          return []
        }
        return Array.isArray(data) ? data : []
      }),
      fetch("/api/homes").then(async (res) => {
        const data = await res.json()
        if (!res.ok) {
          console.error("Homes API error:", data)
          return []
        }
        return Array.isArray(data) ? data : []
      }),
      fetch("/api/templates").then(async (res) => {
        const data = await res.json()
        if (!res.ok) {
          console.error("Templates API error:", data)
          return []
        }
        return Array.isArray(data) ? data : []
      }),
      fetch("/api/contractors").then(async (res) => {
        const data = await res.json()
        if (!res.ok) {
          console.error("Contractors API error:", data)
          return []
        }
        return Array.isArray(data) ? data : []
      }),
      fetch("/api/users").then(async (res) => {
        const data = await res.json()
        if (!res.ok) {
          console.error("Users API error:", data)
          return []
        }
        return Array.isArray(data) ? data : []
      }),
      fetch("/api/company/branding").then(async (res) => {
        const data = await res.json()
        if (!res.ok) return null
        return data as CompanyBranding
      }),
      fetch("/api/admin/templates/gantt").then(async (res) => {
        const data = await res.json()
        if (!res.ok) {
          console.error("Templates Gantt API error:", data)
          return null
        }
        return data
      }),
      fetch("/api/category-gates").then(async (res) => {
        const data = await res.json()
        if (!res.ok) return []
        return Array.isArray(data) ? data : []
      }),
      fetch("/api/settings/work-template-categories").then(async (res) => {
        const data = await res.json()
        if (!res.ok) return []
        return Array.isArray(data) ? data : []
      }),
    ])
      .then(
        ([
          subs,
          homesData,
          templatesData,
          contractorsData,
          usersData,
          branding,
          ganttData,
          gatesData,
          templateCategoriesData,
        ]) => {
        setSubdivisions(subs)
        setHomes(homesData)
        setTemplates(templatesData)
        setContractors(contractorsData)
        setUsers(usersData)
        setCompanyBranding(branding ?? null)
        setCategoryGates(Array.isArray(gatesData) ? gatesData : [])
        setTemplateCategoryRows(Array.isArray(templateCategoriesData) ? templateCategoriesData : [])
        if (branding) {
          setBrandForm({
            brandAppName: branding.brandAppName ?? "",
            brandPrimaryColor: branding.brandPrimaryColor ?? "",
            brandAccentColor: branding.brandAccentColor ?? "",
          })
        }
        if (ganttData && Array.isArray(ganttData.criticalPathIds)) {
          setCriticalTemplateIds(ganttData.criticalPathIds as string[])
        } else {
          setCriticalTemplateIds([])
        }
        setLoading(false)
      })
      .catch((err) => {
        console.error("Settings fetch error:", err)
        setSubdivisions([])
        setHomes([])
        setTemplates([])
        setContractors([])
        setUsers([])
        setCompanyBranding(null)
        setCategoryGates([])
        setLoading(false)
      })
  }, [session, router, impersonationChecked, impersonationRole])

  const categoryDurations = useMemo(() => {
    const byCat = templates.reduce((acc, template) => {
      const category = template.optionalCategory || "Uncategorized"
      if (!acc[category]) acc[category] = []
      acc[category].push(template)
      return acc
    }, {} as Record<string, WorkTemplateItem[]>)
    const d: Record<string, number | null> = {}
    for (const cat of Object.keys(byCat)) {
      d[cat] = computeCategoryCriticalPathDuration(byCat[cat])
    }
    return d
  }, [templates])

  const categoryBlocks = useMemo(() => {
    const q = workTemplatesSearchQuery.trim().toLowerCase()
    /** Settings API rows are canonical; also merge rows from template payloads so items still render if categories GET fails or drifts. */
    const rowById = new Map<string, WorkTemplateCategoryRow>()
    for (const c of templateCategoryRows) {
      rowById.set(c.id, c)
    }
    for (const t of templates) {
      const wc = t.workTemplateCategory
      if (wc && !rowById.has(wc.id)) {
        rowById.set(wc.id, {
          id: wc.id,
          name: wc.name,
          categoryPosition: wc.categoryPosition,
          itemCount: 0,
        })
      }
    }
    const byCatId = new Map(
      Array.from(rowById.values()).map((c) => [
        c.id,
        {
          row: c,
          items: [] as WorkTemplateItem[],
        },
      ])
    )
    for (const t of templates) {
      const cid = t.workTemplateCategoryId
      if (cid && byCatId.has(cid)) {
        byCatId.get(cid)!.items.push(t)
      }
    }
    let blocks = Array.from(byCatId.entries())
      .map(([id, { row, items }]) => ({
        id,
        row,
        items: [...items].sort((a, b) => {
          const dp = (a.itemPosition ?? 0) - (b.itemPosition ?? 0)
          if (dp !== 0) return dp
          if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
          return a.name.localeCompare(b.name)
        }),
      }))
      .sort((a, b) => a.row.categoryPosition - b.row.categoryPosition)

    const orphans = templates.filter((t) => {
      const cid = t.workTemplateCategoryId
      if (!cid) return true
      return !byCatId.has(cid)
    })
    if (orphans.length > 0) {
      blocks.push({
        id: "__orphan__",
        row: {
          id: "__orphan__",
          name: "Uncategorized (assign items to a category)",
          categoryPosition: 999_999,
          itemCount: orphans.length,
        },
        items: [...orphans].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
      })
    }

    if (!q) return blocks

    return blocks
      .map((b) => {
        const catMatch = b.row.name.toLowerCase().includes(q)
        const filt = catMatch ? b.items : b.items.filter((t) => t.name.toLowerCase().includes(q))
        return { ...b, items: filt }
      })
      .filter((b) => b.items.length > 0 || b.row.name.toLowerCase().includes(q))
  }, [templateCategoryRows, templates, workTemplatesSearchQuery])

  /** Duration for one item: use editing value when this item is being edited, else template value. */
  const durationFor = (t: WorkTemplateItem): number => {
    if (editingTemplateId === t.id) {
      const n = parseInt(editingTemplateDuration, 10)
      return Number.isNaN(n) || n < 0 ? 0 : n
    }
    return t.defaultDurationDays ?? 0
  }

  /** Project duration = sum of category durations (same numbers shown in each category header). No double counting. */
  const projectTotalDays = useMemo(() => {
    return Object.values(categoryDurations).reduce<number>((sum, d) => sum + (d ?? 0), 0)
  }, [categoryDurations])

  const handleRefresh = () => {
    Promise.all([
      fetch("/api/subdivisions").then((res) => res.json()),
      fetch("/api/homes").then((res) => res.json()),
      fetch("/api/templates").then((res) => res.json()),
      fetch("/api/contractors").then((res) => res.json()),
      fetch("/api/users").then((res) => res.json()),
      fetch("/api/category-gates").then((res) => res.json()),
      fetch("/api/settings/work-template-categories").then((res) => res.json()),
      fetch("/api/company/branding").then(async (res) => (res.ok ? res.json() : null)),
    ])
      .then(([subs, homesData, templatesData, contractorsData, usersData, gatesData, templateCategoriesData, branding]) => {
        setSubdivisions(Array.isArray(subs) ? subs : [])
        setHomes(Array.isArray(homesData) ? homesData : [])
        setTemplates(Array.isArray(templatesData) ? templatesData : [])
        setContractors(Array.isArray(contractorsData) ? contractorsData : [])
        setUsers(Array.isArray(usersData) ? usersData : [])
        setCategoryGates(Array.isArray(gatesData) ? gatesData : [])
        setTemplateCategoryRows(Array.isArray(templateCategoriesData) ? templateCategoriesData : [])
        setCompanyBranding(branding ?? null)
        if (branding) {
          setBrandForm({
            brandAppName: branding.brandAppName ?? "",
            brandPrimaryColor: branding.brandPrimaryColor ?? "",
            brandAccentColor: branding.brandAccentColor ?? "",
          })
        }
      })
      .catch((err) => {
        console.error(err)
        setSubdivisions([])
        setHomes([])
        setTemplates([])
        setContractors([])
        setUsers([])
        setCategoryGates([])
      })
  }

  const refreshTemplatesOnly = async () => {
    const [tRes, cRes] = await Promise.all([
      fetch("/api/templates"),
      fetch("/api/settings/work-template-categories"),
    ])
    const tData = await tRes.json().catch(() => [])
    const cData = await cRes.json().catch(() => [])
    if (Array.isArray(tData)) setTemplates(tData)
    if (Array.isArray(cData)) setTemplateCategoryRows(cData)
  }

  const handleSaveBranding = async () => {
    setBrandSaving(true)
    try {
      const res = await fetch("/api/company/branding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandAppName: brandForm.brandAppName || null,
          brandPrimaryColor: brandForm.brandPrimaryColor || null,
          brandAccentColor: brandForm.brandAccentColor || null,
        }),
      })
      if (res.ok) {
        const updated = await res.json()
        setCompanyBranding((prev) => (prev ? { ...prev, ...updated } : null))
        alert("Branding saved.")
      } else {
        const data = await res.json()
        alert(data.error || "Failed to save branding")
      }
    } catch (err) {
      console.error(err)
      alert("Failed to save branding")
    } finally {
      setBrandSaving(false)
    }
  }

  const handleToggleCategoryGate = async (categoryName: string) => {
    const isGate = categoryGates.some((gate) => gate.categoryName === categoryName)
    
    try {
      if (isGate) {
        // Delete category gate
        const res = await fetch(`/api/category-gates?categoryName=${encodeURIComponent(categoryName)}`, {
          method: "DELETE",
        })
        if (res.ok) {
          handleRefresh()
        } else {
          const data = await res.json()
          alert(data.error || "Failed to remove category gate")
        }
      } else {
        // Create category gate
        const res = await fetch("/api/category-gates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            categoryName,
            gateScope: "DownstreamOnly",
            gateBlockMode: "ScheduleOnly",
            gateName: `${categoryName.replace(/Prelliminary/gi, "Preliminary")} Gate`,
          }),
        })
        if (res.ok) {
          handleRefresh()
        } else {
          const data = await res.json()
          alert(data.error || "Failed to create category gate")
        }
      }
    } catch (err) {
      console.error("Failed to toggle category gate:", err)
      alert("Failed to toggle category gate")
    }
  }

  const persistWorkItemOrderInCategory = async (categoryId: string, orderedTemplateIds: string[]) => {
    const res = await fetch("/api/settings/work-template-items/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId, orderedTemplateIds }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      alert(typeof data?.error === "string" ? data.error : "Failed to save item order")
      return
    }
    await refreshTemplatesOnly()
  }

  const persistCategoryOrder = async (orderedCategoryIds: string[]) => {
    const res = await fetch("/api/settings/work-template-categories/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedCategoryIds }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      alert(typeof data?.error === "string" ? data.error : "Failed to save category order")
      return
    }
    await refreshTemplatesOnly()
  }

  const handleCreateCategory = async () => {
    const name = newCategoryName.trim()
    if (!name) return
    setNewCategorySaving(true)
    try {
      const res = await fetch("/api/settings/work-template-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(typeof data?.error === "string" ? data.error : "Failed to create category")
        return
      }
      setNewCategoryName("")
      setNewCategoryOpen(false)
      await refreshTemplatesOnly()
    } finally {
      setNewCategorySaving(false)
    }
  }

  const handleSaveEditCategory = async () => {
    if (!editCategoryRow) return
    const name = editCategoryName.trim()
    if (!name) return
    setEditCategorySaving(true)
    try {
      const res = await fetch(`/api/settings/work-template-categories/${editCategoryRow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(typeof data?.error === "string" ? data.error : "Failed to update category")
        return
      }
      setEditCategoryRow(null)
      await refreshTemplatesOnly()
      const gRes = await fetch("/api/category-gates").then((r) => r.json())
      if (Array.isArray(gRes)) setCategoryGates(gRes)
    } finally {
      setEditCategorySaving(false)
    }
  }

  const handleDeleteCategoryRow = async (row: WorkTemplateCategoryRow) => {
    if (!confirm(`Delete category "${row.name}"? It must have no work items.`)) return
    const res = await fetch(`/api/settings/work-template-categories/${row.id}`, { method: "DELETE" })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      alert(typeof data?.error === "string" ? data.error : "Failed to delete category")
      return
    }
    await refreshTemplatesOnly()
  }

  const handleDeleteSubdivision = async (id: string, name: string) => {
    if (
      !confirm(
        `Delete subdivision "${name}"? This will also delete all homes in this subdivision.`
      )
    ) {
      return
    }

    try {
      const res = await fetch(`/api/subdivisions/${id}`, { method: "DELETE" })
      if (res.ok) {
        handleRefresh()
      } else {
        const data = await res.json()
        alert(data.error || "Failed to delete subdivision")
      }
    } catch (err) {
      alert("Failed to delete subdivision")
    }
  }

  const handleDeleteHome = async (id: string, address: string) => {
    if (
      !confirm(`Delete home "${address}"? This will also delete all tasks.`)
    ) {
      return
    }

    try {
      const res = await fetch(`/api/homes/${id}`, { method: "DELETE" })
      if (res.ok) {
        handleRefresh()
      } else {
        const data = await res.json()
        alert(data.error || "Failed to delete home")
      }
    } catch (err) {
      alert("Failed to delete home")
    }
  }

  const handleStartEditSubdivision = (sub: Subdivision) => {
    setEditingSubdivisionId(sub.id)
    setEditingSubdivisionName(sub.name)
  }

  const handleCancelEditSubdivision = () => {
    setEditingSubdivisionId(null)
    setEditingSubdivisionName("")
  }

  const handleSaveSubdivisionName = async (id: string) => {
    if (!editingSubdivisionName.trim()) {
      alert("Subdivision name cannot be empty")
      return
    }

    try {
      const res = await fetch(`/api/subdivisions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editingSubdivisionName.trim() }),
      })

      if (res.ok) {
        setEditingSubdivisionId(null)
        setEditingSubdivisionName("")
        handleRefresh()
      } else {
        const data = await res.json()
        alert(data.error || "Failed to update subdivision name")
      }
    } catch (err) {
      console.error("Failed to update subdivision name:", err)
      alert("Failed to update subdivision name")
    }
  }

  const handleStartEditHome = (home: Home) => {
    setEditingHomeId(home.id)
    setEditingHomeAddress(home.addressOrLot)
    setEditingHomeStartDate(home.startDate ? new Date(home.startDate).toISOString().split("T")[0] : "")
    setEditingHomeTargetDate(home.targetCompletionDate ? new Date(home.targetCompletionDate).toISOString().split("T")[0] : "")
    setEditingPlanName(home.planName ?? "")
    setEditingPlanVariant(home.planVariant ?? "")
  }

  const handleCancelEditHome = () => {
    setEditingHomeId(null)
    setEditingHomeAddress("")
    setEditingHomeStartDate("")
    setEditingHomeTargetDate("")
    setEditingPlanName("")
    setEditingPlanVariant("")
    setAssignedSuperintendentIds([])
  }

  useEffect(() => {
    if (!editingHomeId) {
      setAssignedSuperintendentIds([])
      return
    }
    setAssignmentsLoading(true)
    fetch(`/api/homes/${editingHomeId}/assignments`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setAssignedSuperintendentIds(data.map((a: { superintendentUserId: string }) => a.superintendentUserId))
        } else {
          setAssignedSuperintendentIds([])
        }
      })
      .catch(() => setAssignedSuperintendentIds([]))
      .finally(() => setAssignmentsLoading(false))
  }, [editingHomeId])

  const handleSaveAssignments = async (homeId: string) => {
    setAssignmentsSaving(true)
    try {
      const res = await fetch(`/api/homes/${homeId}/assignments`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ superintendentUserIds: assignedSuperintendentIds }),
      })
      if (res.ok) {
        alert("Superintendent assignments saved.")
      } else {
        const data = await res.json()
        alert(data.error || "Failed to save assignments")
      }
    } catch (err) {
      console.error(err)
      alert("Failed to save assignments")
    } finally {
      setAssignmentsSaving(false)
    }
  }

  const superintendentUsers = users.filter((u) => u.role === "Superintendent")

  const handleUploadPlan = async (homeId: string) => {
    const file = planFileInputRef.current?.files?.[0]
    if (!file?.size) {
      alert("Please select a file (PDF or image: PNG, JPEG, WebP). Max 20 MB.")
      return
    }
    setPlanUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      if (editingPlanName.trim()) formData.append("planName", editingPlanName.trim())
      if (editingPlanVariant.trim()) formData.append("planVariant", editingPlanVariant.trim())
      const res = await fetch(`/api/admin/homes/${homeId}/plan`, {
        method: "POST",
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || "Failed to upload plan")
        return
      }
      if (planFileInputRef.current) planFileInputRef.current.value = ""
      handleRefresh()
    } catch (err: any) {
      console.error("Plan upload error:", err)
      alert(err.message || "Failed to upload plan")
    } finally {
      setPlanUploading(false)
    }
  }

  const handleDeletePlan = async (homeId: string) => {
    if (!confirm("Remove the floor plan file for this home? This cannot be undone.")) return
    setPlanDeleting(true)
    try {
      const res = await fetch(`/api/admin/homes/${homeId}/plan`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || "Failed to delete plan")
        return
      }
      handleRefresh()
    } catch (err: any) {
      console.error("Plan delete error:", err)
      alert(err.message || "Failed to delete plan")
    } finally {
      setPlanDeleting(false)
    }
  }

  const handleUploadThumbnail = async (homeId: string) => {
    const file = thumbnailFileInputRef.current?.files?.[0]
    if (!file?.size) {
      alert("Please select an image (PNG, JPEG, WebP). Max 2 MB.")
      return
    }
    setThumbnailUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch(`/api/admin/homes/${homeId}/thumbnail`, {
        method: "POST",
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || "Failed to upload thumbnail")
        return
      }
      if (thumbnailFileInputRef.current) thumbnailFileInputRef.current.value = ""
      handleRefresh()
    } catch (err: unknown) {
      console.error("Thumbnail upload error:", err)
      alert(err instanceof Error ? err.message : "Failed to upload thumbnail")
    } finally {
      setThumbnailUploading(false)
    }
  }

  const handleDeleteThumbnail = async (homeId: string) => {
    if (!confirm("Remove the house thumbnail for this home?")) return
    setThumbnailDeleting(true)
    try {
      const res = await fetch(`/api/admin/homes/${homeId}/thumbnail`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || "Failed to delete thumbnail")
        return
      }
      handleRefresh()
    } catch (err: unknown) {
      console.error("Thumbnail delete error:", err)
      alert(err instanceof Error ? err.message : "Failed to delete thumbnail")
    } finally {
      setThumbnailDeleting(false)
    }
  }

  const handleSaveHome = async (id: string) => {
    if (!editingHomeAddress.trim()) {
      alert("Home address cannot be empty")
      return
    }

    try {
      const updateData: any = {
        addressOrLot: editingHomeAddress.trim(),
      }
      
      if (editingHomeStartDate) {
        updateData.startDate = new Date(editingHomeStartDate).toISOString()
      } else {
        updateData.startDate = null
      }

      if (editingHomeTargetDate) {
        updateData.targetCompletionDate = new Date(editingHomeTargetDate).toISOString()
      } else {
        updateData.targetCompletionDate = null
      }

      updateData.planName = editingPlanName.trim() || null
      updateData.planVariant = editingPlanVariant.trim() || null

      const res = await fetch(`/api/homes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      })

      if (res.ok) {
        setEditingHomeId(null)
        setEditingHomeAddress("")
        setEditingHomeStartDate("")
        setEditingHomeTargetDate("")
        setEditingPlanName("")
        setEditingPlanVariant("")
        handleRefresh()
        alert("Saved")
      } else {
        const data = await res.json()
        alert(data.error || "Failed to update home")
      }
    } catch (err) {
      console.error("Failed to update home:", err)
      alert("Failed to update home")
    }
  }

  const selectedSubdivision = subdivisions.find((s) => s.id === selectedSubdivisionId)
  const selectedSubdivisionHomes = Array.isArray(homes) 
    ? homes.filter((h) => h.subdivision.id === selectedSubdivisionId)
    : []

  const handleStartEditContractor = (contractor: Contractor) => {
    setEditingContractorId(contractor.id)
    setEditingContractor({
      companyName: contractor.companyName,
      contactName: contractor.contactName,
      phone: contractor.phone,
      email: contractor.email || "",
      trade: contractor.trade || "",
      preferredNoticeDays: contractor.preferredNoticeDays?.toString() || "",
      leadDays: contractor.leadDays?.toString() ?? "",
    })
  }

  const handleCancelEditContractor = () => {
    setEditingContractorId(null)
    setEditingContractor({
      companyName: "",
      contactName: "",
      phone: "",
      email: "",
      trade: "",
      preferredNoticeDays: "",
      leadDays: "",
    })
  }

  const handleSaveContractor = async (id: string) => {
    if (!editingContractor.companyName.trim() || !editingContractor.contactName.trim() || !editingContractor.phone.trim()) {
      alert("Company name, contact name, and phone are required")
      return
    }

    try {
      const updateData: any = {
        companyName: editingContractor.companyName.trim(),
        contactName: editingContractor.contactName.trim(),
        phone: editingContractor.phone.trim(),
        email: editingContractor.email.trim() || null,
        trade: editingContractor.trade.trim() || null,
      }

      if (editingContractor.preferredNoticeDays.trim()) {
        const days = parseInt(editingContractor.preferredNoticeDays)
        if (!isNaN(days) && days > 0) {
          updateData.preferredNoticeDays = days
        } else {
          updateData.preferredNoticeDays = null
        }
      } else {
        updateData.preferredNoticeDays = null
      }

      if (editingContractor.leadDays.trim() === "") {
        updateData.leadDays = 0
      } else {
        const leadDays = parseInt(editingContractor.leadDays)
        if (!isNaN(leadDays) && leadDays >= 0) {
          if (leadDays > 60) {
            if (!window.confirm("Lead time over 60 days is unusual. Save anyway?")) return
          }
          updateData.leadDays = leadDays
        }
      }

      const res = await fetch(`/api/contractors/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      })

      if (res.ok) {
        setEditingContractorId(null)
        setEditingContractor({
          companyName: "",
          contactName: "",
          phone: "",
          email: "",
          trade: "",
          preferredNoticeDays: "",
          leadDays: "",
        })
        handleRefresh()
      } else {
        const data = await res.json()
        alert(data.error || "Failed to update contractor")
      }
    } catch (err) {
      console.error("Failed to update contractor:", err)
      alert("Failed to update contractor")
    }
  }

  const handleStartEditTemplate = (template: WorkTemplateItem) => {
    setEditingTemplateId(template.id)
    setEditingTemplateName(template.name)
    setEditingTemplateDuration(template.defaultDurationDays.toString())
    setEditingTemplateOrder(template.sortOrder.toString())
    setEditingTemplateCategory(template.optionalCategory || "")
    setEditingTemplateRequiresOrdering(template.requiresOrdering ?? false)
    setEditingTemplateMaterialLeadDays((template.materialLeadDays ?? 0).toString())
    setEditingTemplateContractorId(template.contractorId ?? "")
    setEditingTemplateContractorLeadOverrideDays(template.contractorLeadOverrideDays?.toString() ?? "")
    setShowTemplateAdvanced(false)
  }

  const handleCancelEditTemplate = () => {
    setEditingTemplateId(null)
    setEditingTemplateName("")
    setEditingTemplateDuration("")
    setEditingTemplateOrder("")
    setEditingTemplateCategory("")
    setEditingTemplateRequiresOrdering(false)
    setEditingTemplateMaterialLeadDays("")
    setEditingTemplateContractorId("")
    setEditingTemplateContractorLeadOverrideDays("")
    setShowTemplateAdvanced(false)
  }

  const handleSaveTemplate = async (id: string) => {
    if (!editingTemplateName.trim()) {
      alert("Template name cannot be empty")
      return
    }

    const duration = parseInt(editingTemplateDuration)
    if (isNaN(duration) || duration < 0) {
      alert("Duration must be 0 or greater")
      return
    }

    const order = parseInt(editingTemplateOrder)
    if (isNaN(order)) {
      alert("Order must be a number")
      return
    }

    const materialLeadDays = parseInt(editingTemplateMaterialLeadDays)
    if (editingTemplateMaterialLeadDays !== "" && (isNaN(materialLeadDays) || materialLeadDays < 0)) {
      alert("Material lead days must be 0 or greater")
      return
    }

    const contractorLeadOverrideDays =
      editingTemplateContractorLeadOverrideDays.trim() === ""
        ? null
        : (() => {
            const n = parseInt(editingTemplateContractorLeadOverrideDays)
            if (isNaN(n) || n < 0) {
              alert("Override lead days must be 0 or greater")
              return undefined
            }
            return n
          })()
    if (contractorLeadOverrideDays === undefined) return

    try {
      const updateData: any = {
        name: editingTemplateName.trim(),
        defaultDurationDays: duration,
        sortOrder: order,
        optionalCategory: editingTemplateCategory.trim() || null,
        requiresOrdering: editingTemplateRequiresOrdering,
        materialLeadDays: editingTemplateRequiresOrdering ? (editingTemplateMaterialLeadDays === "" ? 0 : materialLeadDays) : 0,
        contractorId: editingTemplateContractorId.trim() || null,
        contractorLeadOverrideDays,
      }

      const res = await fetch(`/api/templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      })

      if (res.ok) {
        setEditingTemplateId(null)
        setEditingTemplateName("")
        setEditingTemplateDuration("")
        setEditingTemplateOrder("")
        setEditingTemplateCategory("")
        setEditingTemplateRequiresOrdering(false)
        setEditingTemplateMaterialLeadDays("")
        setEditingTemplateContractorId("")
        setEditingTemplateContractorLeadOverrideDays("")
        setShowTemplateAdvanced(false)
        handleRefresh()
      } else {
        const data = await res.json()
        alert(data.error || "Failed to update template")
      }
    } catch (err) {
      console.error("Failed to update template:", err)
      alert("Failed to update template")
    }
  }

  const handleStartEditDependencies = async (template: WorkTemplateItem) => {
    setEditingDepsTemplateId(template.id)
    setEditingDepsLoading(true)
    try {
      const res = await fetch(`/api/admin/template-items/${template.id}/dependencies`)
      if (res.ok) {
        const data = await res.json()
        setEditingDepsSelectedIds(Array.isArray(data.dependsOnItemIds) ? data.dependsOnItemIds : [])
      } else {
        const data = await res.json()
        alert(data.error || "Failed to load dependencies")
        setEditingDepsTemplateId(null)
      }
    } catch (err) {
      console.error("Failed to load dependencies:", err)
      alert("Failed to load dependencies")
      setEditingDepsTemplateId(null)
    } finally {
      setEditingDepsLoading(false)
    }
  }

  const handleToggleDependencySelection = (templateId: string) => {
    setEditingDepsSelectedIds((prev) =>
      prev.includes(templateId)
        ? prev.filter((id) => id !== templateId)
        : [...prev, templateId]
    )
  }

  const handleSaveDependencies = async () => {
    if (!editingDepsTemplateId) return
    setEditingDepsLoading(true)
    try {
      const res = await fetch(
        `/api/admin/template-items/${editingDepsTemplateId}/dependencies`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dependsOnItemIds: editingDepsSelectedIds }),
        }
      )
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || "Failed to update dependencies")
        return
      }
      alert("Dependencies updated")
      // Refresh templates so dependency labels update immediately
      handleRefresh()
      setEditingDepsTemplateId(null)
      setEditingDepsSelectedIds([])
    } catch (err) {
      console.error("Failed to update dependencies:", err)
      alert("Failed to update dependencies")
    } finally {
      setEditingDepsLoading(false)
    }
  }

  const handleCancelDependencies = () => {
    setEditingDepsTemplateId(null)
    setEditingDepsSelectedIds([])
  }

  const handleStartEditGate = (template: WorkTemplateItem) => {
    setEditingGateTemplateId(template.id)
    setEditingGateName(template.gateName || "")
    setEditingGateScope(template.gateScope)
    setEditingGateBlockMode(template.gateBlockMode)
  }

  const handleCancelEditGate = () => {
    setEditingGateTemplateId(null)
    setEditingGateName("")
    setEditingGateScope("DownstreamOnly")
    setEditingGateBlockMode("ScheduleOnly")
  }

  const handleSaveGate = async (id: string) => {
    try {
      const res = await fetch(`/api/templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isCriticalGate: true,
          gateName: editingGateName.trim() || null,
          gateScope: editingGateScope,
          gateBlockMode: editingGateBlockMode,
        }),
      })

      if (res.ok) {
        setEditingGateTemplateId(null)
        handleRefresh()
      } else {
        const data = await res.json()
        alert(data.error || "Failed to update gate configuration")
      }
    } catch (err) {
      console.error("Failed to update gate configuration:", err)
      alert("Failed to update gate configuration")
    }
  }

  const handleToggleGate = async (id: string, currentValue: boolean) => {
    try {
      const res = await fetch(`/api/templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isCriticalGate: !currentValue }),
      })

      if (res.ok) {
        handleRefresh()
      } else {
        const data = await res.json()
        alert(data.error || "Failed to update gate status")
      }
    } catch (err) {
      console.error("Failed to update gate status:", err)
      alert("Failed to update gate status")
    }
  }

  const handleDeleteTemplate = async (id: string, name: string) => {
    if (
      !confirm(
        `Delete work template item "${name}"? This cannot be undone if it's already being used by tasks.`
      )
    ) {
      return
    }

    try {
      const res = await fetch(`/api/templates/${id}`, { method: "DELETE" })
      if (res.ok) {
        handleRefresh()
      } else {
        const data = await res.json()
        alert(data.error || "Failed to delete template item")
      }
    } catch (err) {
      alert("Failed to delete template item")
    }
  }

  const handleDeleteContractor = async (id: string, companyName: string) => {
    if (
      !confirm(
        `Delete contractor "${companyName}"? This cannot be undone if they have tasks or users assigned.`
      )
    ) {
      return
    }

    try {
      const res = await fetch(`/api/contractors/${id}`, { method: "DELETE" })
      if (res.ok) {
        handleRefresh()
      } else {
        const data = await res.json()
        alert(data.error || "Failed to delete contractor")
      }
    } catch (err) {
      alert("Failed to delete contractor")
    }
  }

  const handleDeleteUser = async (id: string, name: string) => {
    if (!confirm(`Delete user "${name}"? They will no longer be able to sign in.`)) {
      return
    }
    try {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE" })
      const data = await res.json()
      if (res.ok) {
        handleRefresh()
        if (editingUser?.id === id) {
          setEditingUser(null)
          setEditUserOpen(false)
        }
      } else {
        alert(data.error || "Failed to delete user")
      }
    } catch (err) {
      alert("Failed to delete user")
    }
  }

  const handleResendInvite = async (userId: string) => {
    if (resendInviteInProgressRef.current) return
    resendInviteInProgressRef.current = true
    setResendInviteUserId(userId)
    try {
      const res = await fetch(`/api/admin/users/${userId}/resend-invite`, {
        method: "POST",
      })
      const data = await res.json()
      if (res.ok) {
        handleRefresh()
        if (data.manualLink) {
          setManualInviteMessage(data.message ?? "Invite link rotated but email failed to send.")
          setManualInviteError(data.error ?? null)
          setManualInviteLink(data.manualLink)
          setManualInviteOpen(true)
        } else {
          alert(data.message ?? "Invite email sent.")
        }
      } else {
        alert(data.error ?? "Failed to resend invite")
      }
    } catch (err) {
      console.error("Resend invite error:", err)
      alert("Failed to resend invite")
    } finally {
      resendInviteInProgressRef.current = false
      setResendInviteUserId(null)
    }
  }

  const handleInviteContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteContactVendorId) return
    setInviteContactError("")
    setInviteContactLoading(true)
    try {
      const res = await fetch(`/api/contractors/${inviteContactVendorId}/invite-contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: inviteContactName.trim(),
          email: inviteContactEmail.trim().toLowerCase(),
        }),
      })
      const data = await res.json()
      if (res.ok) {
        if (data.warning) {
          setInviteContactError(data.warning)
          setInviteContactLoading(false)
          return
        }
        setInviteContactVendorId(null)
        setInviteContactOpen(false)
        setInviteContactName("")
        setInviteContactEmail("")
        handleRefresh()
        alert(
          data.linkedExisting
            ? (data.message as string) ||
                "Contact linked to this vendor. SMS works after they have a phone on file and SMS opt-in."
            : "Invite sent. Contact will receive an email to set up their account and opt in to SMS."
        )
      } else {
        setInviteContactError(data.error || "Failed to invite contact")
      }
    } catch (err) {
      setInviteContactError("Something went wrong. Please try again.")
    } finally {
      setInviteContactLoading(false)
    }
  }

  const handleSetDefaultContact = async (contractorId: string, contactId: string) => {
    try {
      const res = await fetch(`/api/contractors/${contractorId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultContactId: contactId }),
      })
      if (res.ok) {
        handleRefresh()
      } else {
        const data = await res.json()
        alert(data.error || "Failed to set default contact")
      }
    } catch {
      alert("Failed to set default contact")
    }
  }

  const effectiveRole = impersonationChecked ? (impersonationRole ?? session?.user?.role) : null
  if (loading || !session?.user || !impersonationChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div>Loading...</div>
      </div>
    )
  }

  if (effectiveRole !== "Admin") {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-100 pb-24 pt-20">
      <div className="app-container">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="mt-1.5 mb-4 text-sm text-muted-foreground">
          Manage subdivisions, homes, work templates, vendors, users, and billing. Settings access required.
        </p>
        <div className="mb-6">
          <SettingsNav />
        </div>

        <Tabs value={settingsTab} className="w-full">

          <TabsContent value="subdivisions-homes" className="space-y-8">
            {selectedSubdivisionId ? (
              // Homes view for selected subdivision
              <>
                <div className="flex items-center gap-4 mb-6">
                  <Button
                    onClick={() => setSelectedSubdivisionId(null)}
                    variant="ghost"
                    size="sm"
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Subdivisions
                  </Button>
                  <h2 className="text-xl font-semibold">
                    {selectedSubdivision?.name} - Homes
                  </h2>
                </div>

                <div className="flex gap-2 flex-wrap mb-6">
                  <Button
                    onClick={() => {
                      setCreateHomeOpen(true)
                      setRefreshSubdivisions((prev) => prev + 1)
                    }}
                    size="sm"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    New Home
                  </Button>
                  <Button
                    onClick={() => setImportHomesOpen(true)}
                    variant="outline"
                    size="sm"
                  >
                    <Upload className="h-4 w-4 mr-1" />
                    Import from Excel
                  </Button>
                </div>

                <div className="space-y-3">
                  {selectedSubdivisionHomes.map((home) => (
                    <Card key={home.id}>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            {editingHomeId === home.id ? (
                              <div className="flex flex-col gap-2 flex-1">
                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    value={editingHomeAddress}
                                    onChange={(e) => setEditingHomeAddress(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        handleSaveHome(home.id)
                                      } else if (e.key === "Escape") {
                                        handleCancelEditHome()
                                      }
                                    }}
                                    className="text-lg font-semibold px-2 py-1 border rounded-md flex-1 max-w-md"
                                    autoFocus
                                    placeholder="Address or Lot"
                                  />
                                  <Button
                                    onClick={() => handleSaveHome(home.id)}
                                    variant="ghost"
                                    size="sm"
                                    className="text-green-600 hover:text-green-700"
                                    title="Save changes"
                                  >
                                    <Check className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    onClick={handleCancelEditHome}
                                    variant="ghost"
                                    size="sm"
                                    className="text-muted-foreground hover:text-foreground"
                                    title="Cancel editing"
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                                <div className="flex items-center gap-2">
                                  <label className="text-sm text-muted-foreground whitespace-nowrap">
                                    Start Date:
                                  </label>
                                  <input
                                    type="date"
                                    value={editingHomeStartDate}
                                    onChange={(e) => setEditingHomeStartDate(e.target.value)}
                                    className="px-2 py-1 border rounded-md text-sm"
                                  />
                                </div>
                                <div className="flex items-center gap-2">
                                  <label className="text-sm text-muted-foreground whitespace-nowrap">
                                    Target Completion:
                                  </label>
                                  <input
                                    type="date"
                                    value={editingHomeTargetDate}
                                    onChange={(e) => setEditingHomeTargetDate(e.target.value)}
                                    className="px-2 py-1 border rounded-md text-sm"
                                  />
                                </div>
                                <div className="border-t pt-3 mt-2">
                                  <p className="text-sm font-medium mb-2">House thumbnail</p>
                                  <p className="text-xs text-muted-foreground mb-2">
                                    Image shown at the top of the home detail screen. PNG, JPEG, or WebP, max 2 MB.
                                  </p>
                                  {home.hasThumbnail && (
                                    <div className="flex items-center gap-2 mb-2">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          fetch(`/api/homes/${home.id}/thumbnail`)
                                            .then((res) => res.json())
                                            .then((data) => {
                                              if (data.exists && data.signedUrl) window.open(data.signedUrl, "_blank")
                                            })
                                            .catch(() => {})
                                        }}
                                        className="text-sm text-primary hover:underline truncate max-w-[200px] text-left"
                                      >
                                        {home.thumbnailFileName || "House thumbnail"}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteThumbnail(home.id)}
                                        disabled={thumbnailDeleting}
                                        className="shrink-0 text-muted-foreground hover:text-destructive p-0.5 rounded"
                                        aria-label="Remove thumbnail"
                                      >
                                        <X className="h-4 w-4" />
                                      </button>
                                    </div>
                                  )}
                                  <input
                                    ref={thumbnailFileInputRef}
                                    key={`thumbnail-file-${home.id}`}
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp"
                                    className="text-sm mb-2"
                                  />
                                  <div className="flex gap-2 flex-wrap">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleUploadThumbnail(home.id)}
                                      disabled={thumbnailUploading}
                                    >
                                      {thumbnailUploading ? "Uploading..." : "Upload thumbnail"}
                                    </Button>
                                  </div>
                                </div>
                                <div className="border-t pt-3 mt-2">
                                  <p className="text-sm font-medium mb-2">Floor Plan</p>
                                  <div className="flex flex-col gap-2">
                                    <div className="flex items-center gap-2">
                                      <label className="text-sm text-muted-foreground whitespace-nowrap">Plan name:</label>
                                      <input
                                        type="text"
                                        value={editingPlanName}
                                        onChange={(e) => setEditingPlanName(e.target.value)}
                                        className="px-2 py-1 border rounded-md text-sm flex-1 max-w-[200px]"
                                        placeholder="e.g. Plan 1875"
                                      />
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <label className="text-sm text-muted-foreground whitespace-nowrap">Variant:</label>
                                      <input
                                        type="text"
                                        value={editingPlanVariant}
                                        onChange={(e) => setEditingPlanVariant(e.target.value)}
                                        className="px-2 py-1 border rounded-md text-sm flex-1 max-w-[200px]"
                                        placeholder="e.g. A, Reversed"
                                      />
                                    </div>
                                    {home.hasPlan && (
                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setPlanViewerHome(home)
                                            setPlanViewerOpen(true)
                                          }}
                                          className="text-sm text-primary hover:underline truncate max-w-[240px] text-left"
                                        >
                                          {home.planFileName || "Floor plan"}
                                          {home.planFileType && ` (${home.planFileType})`}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleDeletePlan(home.id)}
                                          disabled={planDeleting}
                                          className="shrink-0 text-muted-foreground hover:text-destructive p-0.5 rounded"
                                          aria-label="Delete floor plan"
                                        >
                                          <X className="h-4 w-4" />
                                        </button>
                                      </div>
                                    )}
                                    <input
                                      ref={planFileInputRef}
                                      key={`plan-file-${home.id}`}
                                      type="file"
                                      accept="image/*,application/pdf"
                                      className="text-sm"
                                    />
                                    <div className="flex gap-2 flex-wrap">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleUploadPlan(home.id)}
                                        disabled={planUploading}
                                      >
                                        Upload plan
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                                <div className="border-t pt-3 mt-2">
                                  <p className="text-sm font-medium mb-2">Assigned superintendents</p>
                                  <p className="text-xs text-muted-foreground mb-2">
                                    Superintendents assigned to this home will see it on their Homes page.
                                  </p>
                                  {assignmentsLoading ? (
                                    <p className="text-sm text-muted-foreground">Loading…</p>
                                  ) : (
                                    <div className="space-y-2">
                                      {superintendentUsers.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">No superintendent users. Add users with role Superintendent in the Users tab.</p>
                                      ) : (
                                        superintendentUsers.map((u) => (
                                          <label key={u.id} className="flex items-center gap-2 text-sm cursor-pointer">
                                            <input
                                              type="checkbox"
                                              checked={assignedSuperintendentIds.includes(u.id)}
                                              onChange={(e) => {
                                                if (e.target.checked) {
                                                  setAssignedSuperintendentIds((prev) => [...prev, u.id])
                                                } else {
                                                  setAssignedSuperintendentIds((prev) => prev.filter((id) => id !== u.id))
                                                }
                                              }}
                                              className="rounded border-gray-300"
                                            />
                                            <span>{u.name}</span>
                                            <span className="text-muted-foreground">({u.email})</span>
                                          </label>
                                        ))
                                      )}
                                      {superintendentUsers.length > 0 && (
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          onClick={() => handleSaveAssignments(home.id)}
                                          disabled={assignmentsSaving}
                                        >
                                          {assignmentsSaving ? "Saving…" : "Save superintendent assignments"}
                                        </Button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-col">
                                <CardTitle className="text-lg">{home.addressOrLot}</CardTitle>
                                {home.startDate && (
                                  <p className="text-sm text-muted-foreground mt-1">
                                    Start Date: {format(new Date(home.startDate), "MM/dd/yyyy")}
                                  </p>
                                )}
                                {home.targetCompletionDate && (
                                  <p className="text-sm text-muted-foreground mt-1">
                                    Target Completion: {format(new Date(home.targetCompletionDate), "MM/dd/yyyy")}
                                  </p>
                                )}
                                {home.hasPlan && (
                                  <p className="text-sm text-muted-foreground mt-1">
                                    Plan: {[home.planName, home.planVariant].filter(Boolean).join(" – ") || "Floor plan"}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {editingHomeId !== home.id && (
                              <Button
                                onClick={() => handleStartEditHome(home)}
                                variant="ghost"
                                size="sm"
                                className="text-muted-foreground hover:text-foreground"
                                title="Edit home"
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              onClick={() => handleDeleteHome(home.id, home.addressOrLot)}
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              title="Delete home"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                    </Card>
                  ))}
                  {selectedSubdivisionHomes.length === 0 && (
                    <p className="text-muted-foreground text-center py-8">
                      No homes in this subdivision. Create one to get started.
                    </p>
                  )}
                </div>
              </>
            ) : (
              // Subdivisions view
              <>
                <div className="flex gap-2 flex-wrap mb-6">
                  <Button
                    onClick={() => setCreateSubdivisionOpen(true)}
                    variant="outline"
                    size="sm"
                    data-onboarding="subdivisions-button"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    New Subdivision
                  </Button>
                </div>

                <div>
                  <h2 className="text-xl font-semibold mb-4">Subdivisions</h2>
                  <div className="space-y-3">
                    {subdivisions.map((sub) => (
                      <Card
                        key={sub.id}
                        className="cursor-pointer hover:shadow-md transition-shadow"
                        onClick={() => setSelectedSubdivisionId(sub.id)}
                      >
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <div className="flex-1 flex items-center gap-3">
                              {editingSubdivisionId === sub.id ? (
                                <div className="flex items-center gap-2 flex-1">
                                  <input
                                    type="text"
                                    value={editingSubdivisionName}
                                    onChange={(e) => setEditingSubdivisionName(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        handleSaveSubdivisionName(sub.id)
                                      } else if (e.key === "Escape") {
                                        handleCancelEditSubdivision()
                                      }
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-lg font-semibold px-2 py-1 border rounded-md flex-1 max-w-md"
                                    autoFocus
                                  />
                                  <Button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleSaveSubdivisionName(sub.id)
                                    }}
                                    variant="ghost"
                                    size="sm"
                                    className="text-green-600 hover:text-green-700"
                                    title="Save changes"
                                  >
                                    <Check className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleCancelEditSubdivision()
                                    }}
                                    variant="ghost"
                                    size="sm"
                                    className="text-muted-foreground hover:text-foreground"
                                    title="Cancel editing"
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              ) : (
                                <>
                                  <CardTitle className="text-lg">{sub.name}</CardTitle>
                                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                                </>
                              )}
                            </div>
                            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                              {editingSubdivisionId !== sub.id && (
                                <>
                                  <Button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleStartEditSubdivision(sub)
                                    }}
                                    variant="ghost"
                                    size="sm"
                                    className="text-muted-foreground hover:text-foreground"
                                    title="Edit subdivision name"
                                  >
                                    <Edit2 className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleDeleteSubdivision(sub.id, sub.name)
                                    }}
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive hover:text-destructive"
                                    title="Delete subdivision"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-muted-foreground">
                            {sub.homes?.length || 0} home(s)
                          </p>
                        </CardContent>
                      </Card>
                    ))}
                    {subdivisions.length === 0 && (
                      <p className="text-muted-foreground text-center py-8">
                        No subdivisions. Create one to get started.
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="work-templates" className="space-y-8">
            {/* Work Items Template Section */}
            <div className="mx-auto max-w-3xl px-4 sm:px-6 pt-1">
              <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Work Items Template</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Organize work by build phase: create categories first, add items inside each category, and drag to
                order. Flow and schedules use the same sequence. Use the branch icon to edit dependencies (
                unchanged).
              </p>
              <div className="relative mb-4 w-full">
                <Search
                  className="absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground opacity-90 pointer-events-none"
                  aria-hidden
                />
                <input
                  type="search"
                  placeholder="Search work items or category"
                  value={workTemplatesSearchQuery}
                  onChange={(e) => setWorkTemplatesSearchQuery(e.target.value)}
                  className="w-full h-[50px] rounded-lg border border-border bg-white py-3 pl-11 pr-4 text-base shadow-sm placeholder:text-muted-foreground transition-[box-shadow,border-color] focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary"
                  aria-label="Search work items or category"
                />
              </div>
              <div className="flex flex-wrap gap-2 mb-6">
                <Button
                  onClick={() => {
                    setCreateTemplateCategoryId(null)
                    setCreateTemplateOpen(true)
                  }}
                  variant="default"
                  size="sm"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  New Work Item
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setNewCategoryName("")
                    setNewCategoryOpen(true)
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  New Category
                </Button>
                <Button
                  onClick={() => setImportTemplatesOpen(true)}
                  variant="outline"
                  size="sm"
                >
                  <Upload className="h-4 w-4 mr-1" />
                  Import from Excel
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push("/admin/templates/gantt")}
                >
                  <GanttChart className="h-4 w-4 mr-1" />
                  View Gantt
                </Button>
              </div>

              <Dialog open={newCategoryOpen} onOpenChange={setNewCategoryOpen}>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>New category</DialogTitle>
                    <DialogDescription>
                      Add a build phase (e.g. Foundation). Then add work items inside it.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-2 py-2">
                    <label className="text-sm font-medium">Name</label>
                    <input
                      className="w-full rounded-md border px-3 py-2 text-sm"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="e.g. Structural"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setNewCategoryOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="button" disabled={newCategorySaving} onClick={handleCreateCategory}>
                      {newCategorySaving ? "Saving…" : "Create"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog
                open={!!editCategoryRow}
                onOpenChange={(o) => {
                  if (!o) setEditCategoryRow(null)
                }}
              >
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Edit category</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-2 py-2">
                    <label className="text-sm font-medium">Name</label>
                    <input
                      className="w-full rounded-md border px-3 py-2 text-sm"
                      value={editCategoryName}
                      onChange={(e) => setEditCategoryName(e.target.value)}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setEditCategoryRow(null)}>
                      Cancel
                    </Button>
                    <Button type="button" disabled={editCategorySaving} onClick={handleSaveEditCategory}>
                      {editCategorySaving ? "Saving…" : "Save"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              {(() => {
                const searchTrim = workTemplatesSearchQuery.trim()
                const disableReorder = searchTrim.length > 0
                if (templates.length === 0 && templateCategoryRows.length === 0) {
                  return (
                    <p className="text-muted-foreground text-center py-8">
                      No work items yet. Create a category, then add work items.
                    </p>
                  )
                }
                if (categoryBlocks.length === 0) {
                  return <p className="text-muted-foreground text-center py-8">Loading…</p>
                }
                if (categoryBlocks.every((b) => b.items.length === 0) && searchTrim.length > 0) {
                  return (
                    <p className="text-muted-foreground text-center py-8">
                      No work items match your search. Try a different term or clear the search bar.
                    </p>
                  )
                }

                const regularBlocks = categoryBlocks.filter((b) => b.id !== "__orphan__")
                const orphanBlock = categoryBlocks.find((b) => b.id === "__orphan__")
                const sortableCategoryIds = regularBlocks.map((b) => b.id)

                return (
                  <>
                  <Accordion type="multiple" className="w-full space-y-3">
                    {regularBlocks.length > 0 ? (
                    <WorkTemplateCategorySortableSection
                      categoryIds={sortableCategoryIds}
                      disabled={disableReorder}
                      onReorder={persistCategoryOrder}
                    >
                    {regularBlocks.map((block) => {
                      const category = block.row.name
                      const sortedTemplates = block.items
                      const durationDays =
                        categoryDurations[category] ??
                        (sortedTemplates.length > 0
                          ? computeCategoryCriticalPathDuration(sortedTemplates)
                          : null)
                      const durationLabel = durationDays === null ? "—" : `${durationDays} working days`

                      return (
                      <WorkTemplateCategorySortableCard key={block.id} id={block.id} disabled={disableReorder}>
                        <AccordionItem
                          key={block.id}
                          value={block.id}
                          className="rounded-md border border-gray-200 border-l-4 border-l-gray-300 bg-white transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900/20 dark:hover:bg-gray-900/30 border-b-0"
                        >
                          <AccordionTrigger className="hover:no-underline py-4 px-4 [&>svg]:shrink-0">
                            <div className="flex flex-wrap items-center justify-between gap-2 w-full pr-2 min-w-0">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="font-semibold text-gray-900 dark:text-gray-100 text-left break-words">
                                  {category.replace(/Prelliminary/gi, "Preliminary")}
                                </span>
                                {categoryGates.some((gate) => gate.categoryName === category) && (
                                  <span className="text-xs bg-orange-100 dark:bg-orange-900/20 text-orange-800 dark:text-orange-400 px-2 py-1 rounded shrink-0">
                                    Gate
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <Button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleToggleCategoryGate(category)
                                  }}
                                  variant="ghost"
                                  size="sm"
                                  className={
                                    categoryGates.some((gate) => gate.categoryName === category)
                                      ? "min-h-[36px] min-w-[36px] sm:min-h-9 sm:min-w-9 p-0 text-orange-600 hover:text-orange-700 dark:text-orange-400"
                                      : "min-h-[36px] min-w-[36px] sm:min-h-9 sm:min-w-9 p-0 text-muted-foreground hover:text-foreground"
                                  }
                                  title={categoryGates.some((gate) => gate.categoryName === category)
                                    ? "Remove category gate (all tasks in this category must be completed before next category)"
                                    : "Mark category as gate (all tasks in this category must be completed before next category)"
                                  }
                                >
                                  <Lock className={`h-4 w-4 ${categoryGates.some((gate) => gate.categoryName === category) ? "fill-current" : ""}`} />
                                </Button>
                                <span className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                                  {sortedTemplates.length} items · {durationLabel}
                                </span>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-8 shrink-0"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setCreateTemplateCategoryId(block.row.id)
                                    setCreateTemplateOpen(true)
                                  }}
                                >
                                  <Plus className="h-3 w-3 mr-1" />
                                  Work Item
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 shrink-0"
                                  title="Edit category name"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setEditCategoryRow(block.row)
                                    setEditCategoryName(block.row.name)
                                  }}
                                >
                                  <Edit2 className="h-3 w-3" />
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 shrink-0 text-destructive"
                                  title="Delete empty category"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleDeleteCategoryRow(block.row)
                                  }}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="space-y-3 pt-2">
                            <WorkTemplateItemsDndContext
                              itemIds={sortedTemplates.map((t) => t.id)}
                              disabled={disableReorder}
                              onReorder={(ids) => persistWorkItemOrderInCategory(block.row.id, ids)}
                            >
                              {sortedTemplates.map((template) => (
                                <WorkTemplateItemSortableRow key={template.id} id={template.id} disabled={disableReorder}>
                                <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          {editingTemplateId === template.id ? (
                            <div className="space-y-3">
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={editingTemplateName}
                                  onChange={(e) => setEditingTemplateName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      handleSaveTemplate(template.id)
                                    } else if (e.key === "Escape") {
                                      handleCancelEditTemplate()
                                    }
                                  }}
                                  className="text-lg font-semibold px-2 py-1 border rounded-md flex-1 max-w-md"
                                  placeholder="Template name"
                                  autoFocus
                                />
                                <Button
                                  onClick={() => handleSaveTemplate(template.id)}
                                  variant="ghost"
                                  size="sm"
                                  className="text-green-600 hover:text-green-700"
                                  title="Save changes"
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button
                                  onClick={handleCancelEditTemplate}
                                  variant="ghost"
                                  size="sm"
                                  className="text-muted-foreground hover:text-foreground"
                                  title="Cancel editing"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                              <div className="grid grid-cols-3 gap-2">
                                <div>
                                  <label className="text-xs text-muted-foreground mb-1 block">Duration (days)</label>
                                  <input
                                    type="number"
                                    value={editingTemplateDuration}
                                    onChange={(e) => setEditingTemplateDuration(e.target.value)}
                                    className="w-full px-2 py-1 border rounded-md text-sm"
                                    placeholder="Duration"
                                    min="1"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-muted-foreground mb-1 block">Order</label>
                                  <input
                                    type="number"
                                    value={editingTemplateOrder}
                                    onChange={(e) => setEditingTemplateOrder(e.target.value)}
                                    className="w-full px-2 py-1 border rounded-md text-sm"
                                    placeholder="Order"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-muted-foreground mb-1 block">Category</label>
                                  <input
                                    type="text"
                                    value={editingTemplateCategory}
                                    onChange={(e) => setEditingTemplateCategory(e.target.value)}
                                    className="w-full px-2 py-1 border rounded-md text-sm"
                                    placeholder="Category (optional)"
                                  />
                                </div>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2 pt-2 border-t border-border">
                                <div className="flex items-end gap-2">
                                  <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={editingTemplateRequiresOrdering}
                                      onChange={(e) => setEditingTemplateRequiresOrdering(e.target.checked)}
                                      className="rounded border-border"
                                    />
                                    Requires materials
                                  </label>
                                </div>
                                {editingTemplateRequiresOrdering && (
                                  <div>
                                    <label className="text-xs text-muted-foreground mb-1 block">Material lead (days)</label>
                                    <input
                                      type="number"
                                      value={editingTemplateMaterialLeadDays}
                                      onChange={(e) => setEditingTemplateMaterialLeadDays(e.target.value)}
                                      className="w-full px-2 py-1 border rounded-md text-sm"
                                      placeholder="0"
                                      min="0"
                                    />
                                  </div>
                                )}
                              </div>
                              <div className="mt-2 pt-2 border-t border-border">
                                <label className="text-xs text-muted-foreground mb-1 block">Contractor</label>
                                <select
                                  value={editingTemplateContractorId}
                                  onChange={(e) => setEditingTemplateContractorId(e.target.value)}
                                  className="w-full max-w-md px-2 py-1.5 border rounded-md text-sm bg-white dark:bg-gray-900"
                                >
                                  <option value="">No contractor</option>
                                  {contractors.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.companyName}
                                      {c.trade ? ` (${c.trade})` : ""}
                                    </option>
                                  ))}
                                </select>
                                <p className="text-xs text-muted-foreground mt-1">Lead time pulled from contractor settings.</p>
                              </div>
                              <div className="mt-2">
                                <button
                                  type="button"
                                  onClick={() => setShowTemplateAdvanced(!showTemplateAdvanced)}
                                  className="text-xs text-muted-foreground hover:text-foreground underline"
                                >
                                  {showTemplateAdvanced ? "Hide" : "Show"} advanced
                                </button>
                                {showTemplateAdvanced && (
                                  <div className="mt-2 pl-2 border-l-2 border-border">
                                    <label className="text-xs text-muted-foreground mb-1 block">Override lead days</label>
                                    <input
                                      type="number"
                                      value={editingTemplateContractorLeadOverrideDays}
                                      onChange={(e) => setEditingTemplateContractorLeadOverrideDays(e.target.value)}
                                      className="w-24 px-2 py-1 border rounded-md text-sm"
                                      placeholder="—"
                                      min="0"
                                    />
                                    <p className="text-xs text-muted-foreground mt-0.5">Leave empty to use contractor lead time.</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <CardTitle
                                className="text-lg cursor-pointer hover:text-primary transition-colors"
                                onClick={() => handleStartEditTemplate(template)}
                              >
                                {template.name}
                              </CardTitle>
                              {criticalTemplateIds.includes(template.id) && (
                                <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700">
                                  Critical path
                                </span>
                              )}
                            </div>
                          )}
                          {editingTemplateId !== template.id && (
                            <div className="flex gap-4 mt-2 text-sm text-muted-foreground items-center flex-wrap">
                              <span>Duration: {template.defaultDurationDays} days</span>
                              <span>Sort order: {template.sortOrder}</span>
                              {template.sequenceOrder != null && (
                                <span>Display order: {template.sequenceOrder}</span>
                              )}
                              {template.optionalCategory && (
                                <span>Category: {template.optionalCategory}</span>
                              )}
                              {template.contractor && (
                                <span>Contractor: {template.contractor.companyName}{template.contractor.trade ? ` (${template.contractor.trade})` : ""}</span>
                              )}
                              {template.requiresOrdering && (
                                <span>Ordering • Material lead: {template.materialLeadDays ?? 0}d</span>
                              )}
                              {Array.isArray(template.dependencies) && template.dependencies.length > 0 && (
                                <span>
                                  Depends on:{" "}
                                  {template.dependencies
                                    .map((d) => d.dependsOnItem?.name)
                                    .filter(Boolean)
                                    .join(", ") || `${template.dependencies.length} item(s)`}
                                </span>
                              )}
                              {template.isDependency && (
                                <span className="text-xs bg-yellow-100 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-400 px-2 py-1 rounded">
                                  Dependency
                                </span>
                              )}
                              {template.isCriticalGate && (
                                <span className="text-xs bg-orange-100 dark:bg-orange-900/20 text-orange-800 dark:text-orange-400 px-2 py-1 rounded">
                                  Critical Gate: {template.gateName || "Unnamed"}
                                </span>
                              )}
                            </div>
                          )}
                          {editingDepsTemplateId === template.id && (
                            <div className="mt-4 p-4 border rounded-lg bg-muted/50 space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">
                                  Dependencies (template-level)
                                </span>
                                {editingDepsLoading && (
                                  <span className="text-xs text-muted-foreground">
                                    Loading...
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Select prerequisite work items that must be completed before this
                                item can be scheduled. Dependencies are managed in Settings only.
                              </p>
                              <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
                                {sortWorkTemplatesForDisplay(templates.filter((t) => t.id !== template.id)).map(
                                  (t) => (
                                    <label
                                      key={t.id}
                                      className="flex items-center gap-2 text-sm cursor-pointer"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={editingDepsSelectedIds.includes(t.id)}
                                        onChange={() => handleToggleDependencySelection(t.id)}
                                      />
                                      <span>
                                        {t.name}
                                        <span className="text-xs text-muted-foreground ml-1">
                                          (Order {t.sortOrder})
                                        </span>
                                      </span>
                                    </label>
                                  ))}
                              </div>
                              <div className="flex gap-2 justify-end pt-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={handleCancelDependencies}
                                >
                                  <X className="h-4 w-4 mr-1" />
                                  Cancel
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={handleSaveDependencies}
                                  disabled={editingDepsLoading}
                                >
                                  <Check className="h-4 w-4 mr-1" />
                                  Save Dependencies
                                </Button>
                              </div>
                            </div>
                          )}
                          {editingGateTemplateId === template.id && (
                            <div className="mt-4 p-4 border rounded-lg bg-muted/50 space-y-3">
                              <div>
                                <label className="text-sm font-medium mb-1 block">Gate Name</label>
                                <input
                                  type="text"
                                  value={editingGateName}
                                  onChange={(e) => setEditingGateName(e.target.value)}
                                  placeholder="e.g., Structural Walkthrough"
                                  className="w-full p-2 border rounded text-sm"
                                />
                              </div>
                              <div>
                                <label className="text-sm font-medium mb-1 block">Gate Scope</label>
                                <select
                                  value={editingGateScope}
                                  onChange={(e) => setEditingGateScope(e.target.value as "DownstreamOnly" | "AllScheduling")}
                                  className="w-full p-2 border rounded text-sm"
                                >
                                  <option value="DownstreamOnly">Downstream Only (blocks tasks after this)</option>
                                  <option value="AllScheduling">All Scheduling (blocks all other tasks)</option>
                                </select>
                              </div>
                              <div>
                                <label className="text-sm font-medium mb-1 block">Block Mode</label>
                                <select
                                  value={editingGateBlockMode}
                                  onChange={(e) => setEditingGateBlockMode(e.target.value as "ScheduleOnly" | "ScheduleAndConfirm")}
                                  className="w-full p-2 border rounded text-sm"
                                >
                                  <option value="ScheduleOnly">Schedule Only (blocks scheduling)</option>
                                  <option value="ScheduleAndConfirm">Schedule & Confirm (blocks scheduling and SMS)</option>
                                </select>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  onClick={() => handleSaveGate(template.id)}
                                  size="sm"
                                  variant="default"
                                >
                                  <Check className="h-4 w-4 mr-1" />
                                  Save Gate
                                </Button>
                                <Button
                                  onClick={handleCancelEditGate}
                                  size="sm"
                                  variant="outline"
                                >
                                  <X className="h-4 w-4 mr-1" />
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {editingTemplateId !== template.id && (
                            <>
                              <Button
                                onClick={() => template.isCriticalGate ? handleToggleGate(template.id, true) : handleStartEditGate(template)}
                                variant="ghost"
                                size="sm"
                                className={template.isCriticalGate 
                                  ? "text-orange-600 hover:text-orange-700 dark:text-orange-400" 
                                  : "text-muted-foreground hover:text-foreground"
                                }
                                title={template.isCriticalGate ? "Disable critical gate" : "Configure critical gate (blocks scheduling until punch items resolved)"}
                              >
                                <Lock className={`h-4 w-4 ${template.isCriticalGate ? "fill-current" : ""}`} />
                              </Button>
                              {template.isCriticalGate && editingGateTemplateId !== template.id && (
                                <Button
                                  onClick={() => handleStartEditGate(template)}
                                  variant="ghost"
                                  size="sm"
                                  className="text-muted-foreground hover:text-foreground"
                                  title="Edit gate configuration"
                                >
                                  <Settings className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                onClick={() => handleStartEditTemplate(template)}
                                variant="ghost"
                                size="sm"
                                className="text-muted-foreground hover:text-foreground"
                                title="Edit template item name"
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button
                                onClick={() => handleStartEditDependencies(template)}
                                variant="ghost"
                                size="sm"
                                className="text-muted-foreground hover:text-foreground"
                                title="Edit dependencies (prerequisite work items)"
                              >
                                <GitBranch className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          <Button
                            onClick={() =>
                              handleDeleteTemplate(template.id, template.name)
                            }
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            title="Delete template item"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                                </WorkTemplateItemSortableRow>
                              ))}
                            </WorkTemplateItemsDndContext>
                              <div className="text-right text-sm text-muted-foreground pt-2 mt-2 border-t border-border">
                                Category total: {sortedTemplates.reduce((s, t) => s + durationFor(t), 0)} days
                              </div>
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      </WorkTemplateCategorySortableCard>
                      )
                    })}
                    </WorkTemplateCategorySortableSection>
                    ) : null}
                    {orphanBlock && orphanBlock.items.length > 0 ? (
                      <AccordionItem
                        key={orphanBlock.id}
                        value={orphanBlock.id}
                        className="rounded-md border border-amber-200/80 border-l-4 border-l-amber-400 bg-amber-50/30 dark:border-amber-900/40 dark:bg-amber-950/20 border-b-0"
                      >
                        <AccordionTrigger className="hover:no-underline py-4 px-4 [&>svg]:shrink-0">
                          <div className="flex flex-wrap items-center gap-2 w-full pr-2 min-w-0">
                            <span className="font-semibold text-left break-words">
                              {orphanBlock.row.name}
                            </span>
                            <span className="text-sm text-muted-foreground whitespace-nowrap">
                              {orphanBlock.items.length} items · edit an item to assign a category
                            </span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-3 pt-2">
                            {orphanBlock.items.map((template) => (
                              <Card key={template.id}>
                                <CardHeader>
                                  <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                      <CardTitle className="text-lg">{template.name}</CardTitle>
                                      <p className="text-sm text-muted-foreground mt-1">
                                        {template.defaultDurationDays} days · assign category via Edit
                                      </p>
                                    </div>
                                    <div className="flex gap-2">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleStartEditTemplate(template)}
                                      >
                                        <Edit2 className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleStartEditDependencies(template)}
                                      >
                                        <GitBranch className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-destructive"
                                        onClick={() => handleDeleteTemplate(template.id, template.name)}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                </CardHeader>
                              </Card>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ) : null}
                  </Accordion>
                  <TemplateSummaryCard
                    totalWorkingDays={projectTotalDays}
                    totalWorkItems={templates.length}
                    categoryCount={categoryBlocks.filter((b) => b.id !== "__orphan__").length}
                    infoTitle="This is the sum of all template task durations. Actual forecast duration may differ based on dependencies."
                  />
                  </>
                )
                })()}
            </div>
          </TabsContent>

          <TabsContent value="contractors" className="space-y-8">
            <div className="flex gap-2 flex-wrap mb-6">
              {(session?.user?.role === "Admin" || session?.user?.role === "Manager") && (
                <>
                  <Button
                    onClick={() => setImportContractorsOpen(true)}
                    variant="outline"
                    size="sm"
                  >
                    <FileSpreadsheet className="h-4 w-4 mr-1" />
                    Import from Excel
                  </Button>
                  <Button
                    onClick={() => {
                      setSubSearchOpen(true)
                      setSubSearchQuery("")
                      setSubSearchResults([])
                      setSubSearchError(null)
                    }}
                    variant="outline"
                    size="sm"
                  >
                    <Search className="h-4 w-4 mr-1" />
                    Search Phase directory
                  </Button>
                </>
              )}
              <Button
                onClick={() => setCreateContractorOpen(true)}
                variant="outline"
                size="sm"
              >
                <Plus className="h-4 w-4 mr-1" />
                New Vendor
              </Button>
            </div>

            {/* Vendors Section */}
            <div>
              <h2 className="text-xl font-semibold mb-4">Vendors</h2>
              <p className="text-sm text-muted-foreground mb-3 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2">
                SMS now requires Contact opt-in. Vendor office phone numbers are not used for automated SMS. Invite contacts from each vendor and have them accept the invite with SMS consent.
              </p>
              <div className="space-y-3">
                {contractors.map((contractor) => (
                  <Card key={contractor.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        {editingContractorId === contractor.id ? (
                          <div className="flex-1 space-y-3">
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={editingContractor.companyName}
                                onChange={(e) =>
                                  setEditingContractor({
                                    ...editingContractor,
                                    companyName: e.target.value,
                                  })
                                }
                                placeholder="Company Name"
                                className="text-lg font-semibold px-2 py-1 border rounded-md flex-1"
                                autoFocus
                              />
                              <Button
                                onClick={() => handleSaveContractor(contractor.id)}
                                variant="ghost"
                                size="sm"
                                className="text-green-600 hover:text-green-700"
                                title="Save changes"
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                onClick={handleCancelEditContractor}
                                variant="ghost"
                                size="sm"
                                className="text-muted-foreground hover:text-foreground"
                                title="Cancel editing"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-xs text-muted-foreground">Contact Name</label>
                                <input
                                  type="text"
                                  value={editingContractor.contactName}
                                  onChange={(e) =>
                                    setEditingContractor({
                                      ...editingContractor,
                                      contactName: e.target.value,
                                    })
                                  }
                                  className="w-full px-2 py-1 border rounded-md text-sm"
                                  placeholder="Contact Name"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-muted-foreground">Office phone (not used for SMS)</label>
                                <input
                                  type="text"
                                  value={editingContractor.phone}
                                  onChange={(e) =>
                                    setEditingContractor({
                                      ...editingContractor,
                                      phone: e.target.value,
                                    })
                                  }
                                  className="w-full px-2 py-1 border rounded-md text-sm"
                                  placeholder="Office phone"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-muted-foreground">Email</label>
                                <input
                                  type="email"
                                  value={editingContractor.email}
                                  onChange={(e) =>
                                    setEditingContractor({
                                      ...editingContractor,
                                      email: e.target.value,
                                    })
                                  }
                                  className="w-full px-2 py-1 border rounded-md text-sm"
                                  placeholder="Email (optional)"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-muted-foreground">Trade</label>
                                <input
                                  type="text"
                                  value={editingContractor.trade}
                                  onChange={(e) =>
                                    setEditingContractor({
                                      ...editingContractor,
                                      trade: e.target.value,
                                    })
                                  }
                                  className="w-full px-2 py-1 border rounded-md text-sm"
                                  placeholder="Trade (optional)"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-muted-foreground">Preferred Notice Days</label>
                                <input
                                  type="number"
                                  value={editingContractor.preferredNoticeDays}
                                  onChange={(e) =>
                                    setEditingContractor({
                                      ...editingContractor,
                                      preferredNoticeDays: e.target.value,
                                    })
                                  }
                                  className="w-full px-2 py-1 border rounded-md text-sm"
                                  placeholder="Days (optional)"
                                  min="1"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-muted-foreground">Lead time (days)</label>
                                <input
                                  type="number"
                                  value={editingContractor.leadDays}
                                  onChange={(e) =>
                                    setEditingContractor({
                                      ...editingContractor,
                                      leadDays: e.target.value,
                                    })
                                  }
                                  className="w-full px-2 py-1 border rounded-md text-sm"
                                  placeholder="0"
                                  min="0"
                                  max="60"
                                />
                                <p className="text-xs text-muted-foreground mt-0.5">Default lead time for Flow prep / Get Ready. Used by task templates assigned to this vendor.</p>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <CardTitle className="text-lg">
                            {contractor.companyName}
                          </CardTitle>
                        )}
                        <div className="flex items-center gap-2">
                          {editingContractorId !== contractor.id && (
                            <Button
                              onClick={() => handleStartEditContractor(contractor)}
                              variant="ghost"
                              size="sm"
                              className="text-muted-foreground hover:text-foreground"
                              title="Edit contractor information"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            onClick={() =>
                              handleDeleteContractor(contractor.id, contractor.companyName)
                            }
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            title="Delete contractor"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    {editingContractorId !== contractor.id && (
                      <CardContent>
                        <div className="space-y-2 text-sm">
                          <div>
                            <span className="font-medium">Contact: </span>
                            {contractor.contactName}
                          </div>
                          <div>
                            <span className="font-medium">Office phone: </span>
                            {contractor.phone}
                            <span className="text-muted-foreground text-xs ml-1">(not used for SMS)</span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Office phone is not used for SMS notifications. Contacts must opt in to receive texts.
                          </p>
                          {contractor.email && (
                            <div>
                              <span className="font-medium">Email: </span>
                              {contractor.email}
                            </div>
                          )}
                          {contractor.trade && (
                            <div>
                              <span className="font-medium">Trade: </span>
                              {contractor.trade}
                            </div>
                          )}
                          {(contractor.leadDays ?? 0) > 0 && (
                            <div>
                              <span className="font-medium">Lead time: </span>
                              {contractor.leadDays} days
                            </div>
                          )}
                          {contractor.preferredNoticeDays && (
                            <div>
                              <span className="font-medium">Preferred Notice: </span>
                              {contractor.preferredNoticeDays} day(s)
                            </div>
                          )}
                        </div>
                        {/* Contacts (people who receive SMS) */}
                        <div className="mt-4 pt-4 border-t">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-sm">Contacts</span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setInviteContactVendorId(contractor.id)
                                setInviteContactName("")
                                setInviteContactEmail("")
                                setInviteContactError("")
                                setInviteContactOpen(true)
                              }}
                            >
                              <Mail className="h-3 w-3 mr-1" />
                              Invite Contact
                            </Button>
                          </div>
                          {(contractor.users?.length ?? 0) > 0 ? (
                            <ul className="space-y-2 text-sm">
                              {(contractor.users ?? []).map((u) => {
                                const isDefault = contractor.defaultContactId === u.id
                                const smsEligible = !!(u.phoneE164 && u.smsConsent && !u.smsOptOutAt)
                                return (
                                  <li key={u.id} className="flex flex-wrap items-center gap-2 py-1">
                                    <span>{u.name}</span>
                                    <span className="text-muted-foreground">{u.email}</span>
                                    {u.status === "INVITED" && (
                                      <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400 px-2 py-0.5 rounded">
                                        Invited
                                      </span>
                                    )}
                                    {u.status === "ACTIVE" && (
                                      <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 px-2 py-0.5 rounded">
                                        Active
                                      </span>
                                    )}
                                    {u.status === "ACTIVE" && smsEligible && (
                                      <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400 px-2 py-0.5 rounded">
                                        SMS Opted-in
                                      </span>
                                    )}
                                    {u.smsOptOutAt && (
                                      <span className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded">
                                        Opted out
                                      </span>
                                    )}
                                    {isDefault && (
                                      <span className="text-xs text-muted-foreground">(default for SMS)</span>
                                    )}
                                    {u.status === "ACTIVE" && smsEligible && !isDefault && (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="text-xs h-7"
                                        onClick={() => handleSetDefaultContact(contractor.id, u.id)}
                                      >
                                        Set as default
                                      </Button>
                                    )}
                                  </li>
                                )
                              })}
                            </ul>
                          ) : (
                            <p className="text-muted-foreground text-xs">
                              No contacts yet. Invite a contact to receive SMS for this vendor.
                            </p>
                          )}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                ))}
                {contractors.length === 0 && (
                  <p className="text-muted-foreground text-center py-8">
                    No vendors. Create one to get started.
                  </p>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="users" className="space-y-8">
            <div className="flex gap-2 flex-wrap mb-6">
              <Button
                onClick={() => setCreateUserOpen(true)}
                variant="outline"
                size="sm"
              >
                <Plus className="h-4 w-4 mr-1" />
                New User
              </Button>
            </div>

            <div>
              <h2 className="text-xl font-semibold mb-4">Users</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Add Superintendents, Managers, Admins, and Contacts. Create and invite contacts from the Vendors tab for the best workflow.
              </p>
              <div className="space-y-3">
                {users.map((u) => (
                  <Card key={u.id}>
                    <CardHeader className="py-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-lg">{u.name}</CardTitle>
                          <div className="flex flex-wrap items-center gap-2 mt-2 text-sm text-muted-foreground">
                            <span>{u.email}</span>
                            {u.phoneE164 && (
                              <span title="SMS number (set when contact accepted invite)">{u.phoneE164}</span>
                            )}
                            <span className="font-medium text-foreground">{u.role}</span>
                            {u.contractor && (
                              <span>— {u.contractor.companyName}</span>
                            )}
                            {u.status && (
                              <span
                                className={
                                  u.status === "INVITED"
                                    ? "text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400 px-2 py-0.5 rounded font-medium"
                                    : u.status === "ACTIVE"
                                      ? "text-xs bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 px-2 py-0.5 rounded font-medium"
                                      : "text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded font-medium"
                                }
                              >
                                {u.status}
                              </span>
                            )}
                            {!u.isActive && !u.status && (
                              <span className="text-destructive">(inactive)</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {u.status === "INVITED" && (
                            <Button
                              onClick={() => handleResendInvite(u.id)}
                              variant="outline"
                              size="sm"
                              disabled={resendInviteUserId === u.id}
                              title="Resend invite email"
                            >
                              <Mail className="h-4 w-4 mr-1" />
                              {resendInviteUserId === u.id ? "Sending..." : "Resend invite"}
                            </Button>
                          )}
                          <Button
                            onClick={() => {
                              setEditingUser(u)
                              setEditUserOpen(true)
                            }}
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-foreground"
                            title="Edit user"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          {u.role !== "Admin" && (
                            <Button
                              onClick={() => handleDeleteUser(u.id, u.name)}
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              title="Delete user"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                ))}
                {users.length === 0 && (
                  <p className="text-muted-foreground text-center py-8">
                    No users. Create one to get started.
                  </p>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="white-label" className="space-y-8">
            <div className="relative">
              {companyBranding && companyBranding.pricingTier !== "WHITE_LABEL" && (
                <div
                  className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-muted/80"
                  title="Only available for White Label tier"
                >
                  <div className="flex flex-col items-center gap-2 rounded-lg border border-muted-foreground/30 bg-background/95 px-6 py-4 shadow-sm">
                    <Lock className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm font-medium text-muted-foreground">
                      Only available for White Label tier
                    </p>
                    <p className="text-xs text-muted-foreground text-center max-w-xs">
                      Upgrade to White Label to customize your app name, logo, and colors.
                    </p>
                  </div>
                </div>
              )}
              <Card className={!companyBranding || companyBranding.pricingTier !== "WHITE_LABEL" ? "opacity-70" : ""}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Palette className="h-5 w-5" />
                    White Label Branding
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Customize how your company name, logo, and colors appear in the app. White label
                    is available as a $99/mo add-on. During trial, you can preview the branded belt
                    and branded messages.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">App name (display)</label>
                    <input
                      type="text"
                      value={brandForm.brandAppName}
                      onChange={(e) => setBrandForm((f) => ({ ...f, brandAppName: e.target.value }))}
                      placeholder={companyBranding?.name ?? "Your company name"}
                      className="w-full px-3 py-2 border rounded-md"
                      disabled={!companyBranding || companyBranding.pricingTier !== "WHITE_LABEL"}
                      title={!companyBranding || companyBranding.pricingTier !== "WHITE_LABEL" ? "Only available for White Label tier" : undefined}
                    />
                  </div>
                  {/* Logo requirements */}
                  <div className="rounded-md border border-muted bg-muted/30 px-3 py-2 text-xs text-muted-foreground space-y-1">
                    <p className="font-medium text-foreground">Logo requirements</p>
                    <ul className="list-disc list-inside space-y-0.5">
                      <li>Format: SVG preferred; PNG also supported</li>
                      <li>Background: transparent</li>
                      <li>Aspect: horizontal (wide). Recommended: 512×128 px (4:1) or 1024×256 px</li>
                      <li>Max file size: 1 MB. Safe padding: 8–12% around edges</li>
                    </ul>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Company logo</label>
                    {companyBranding?.logoUrl ? (
                      <div className="flex flex-wrap items-center gap-3 mt-1">
                        <img src={companyBranding.brandingUpdatedAt ? `${companyBranding.logoUrl}?v=${new Date(companyBranding.brandingUpdatedAt).getTime()}` : companyBranding.logoUrl} alt="Company logo" className="max-h-20 max-w-[280px] w-auto object-contain border rounded" onError={(e) => (e.currentTarget.style.display = "none")} />
                        <div className="flex gap-2">
                          <input
                            ref={logoFileInputRef}
                            type="file"
                            accept=".svg,.png,image/svg+xml,image/png"
                            className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0]
                              if (!file || !companyBranding || companyBranding.pricingTier !== "WHITE_LABEL") return
                              if (file.size > 1024 * 1024) { alert("Logo must be 1 MB or smaller"); return }
                              setLogoUploading(true)
                              try {
                                const fd = new FormData(); fd.append("file", file)
                                const res = await fetch("/api/admin/branding/logo", { method: "POST", body: fd })
                                if (res.ok) handleRefresh()
                                else { const d = await res.json(); alert(d.error || "Upload failed") }
                              } finally { setLogoUploading(false); e.target.value = "" }
                            }}
                          />
                          <Button type="button" variant="outline" size="sm" disabled={logoUploading || !companyBranding || companyBranding.pricingTier !== "WHITE_LABEL"} onClick={() => logoFileInputRef.current?.click()}>
                            {logoUploading ? "Uploading…" : "Replace"}
                          </Button>
                          <Button type="button" variant="outline" size="sm" disabled={!companyBranding || companyBranding.pricingTier !== "WHITE_LABEL"} onClick={async () => {
                            if (!confirm("Remove logo? The Phase logo will show until you upload a new one.")) return
                            const res = await fetch("/api/admin/branding/logo", { method: "DELETE" })
                            if (res.ok) handleRefresh()
                            else { const d = await res.json(); alert(d.error || "Failed to remove") }
                          }}>
                            Remove
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-1">
                        <input
                          ref={logoFileInputRef}
                          type="file"
                          accept=".svg,.png,image/svg+xml,image/png"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0]
                            if (!file || !companyBranding || companyBranding.pricingTier !== "WHITE_LABEL") return
                            if (file.size > 1024 * 1024) { alert("Logo must be 1 MB or smaller"); return }
                            setLogoUploading(true)
                            try {
                              const fd = new FormData(); fd.append("file", file)
                              const res = await fetch("/api/admin/branding/logo", { method: "POST", body: fd })
                              if (res.ok) handleRefresh()
                              else { const d = await res.json(); alert(d.error || "Upload failed") }
                            } finally { setLogoUploading(false); e.target.value = "" }
                            }}
                        />
                        <Button type="button" variant="outline" size="sm" disabled={logoUploading || !companyBranding || companyBranding.pricingTier !== "WHITE_LABEL"} onClick={() => logoFileInputRef.current?.click()}>
                          {logoUploading ? "Uploading…" : "Upload logo"}
                        </Button>
                        <p className="text-xs text-muted-foreground mt-1">No logo set. Phase logo is shown until you upload one.</p>
                      </div>
                    )}
                  </div>
                  {/* Favicon (optional) */}
                  <div className="rounded-md border border-muted bg-muted/30 px-3 py-2 text-xs text-muted-foreground space-y-1">
                    <p className="font-medium text-foreground">Favicon (optional)</p>
                    <p>PNG, 256×256 px (min 128×128). Max 300 KB.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Favicon</label>
                    {companyBranding?.faviconUrl ? (
                      <div className="flex flex-wrap items-center gap-3 mt-1">
                        <img src={companyBranding.brandingUpdatedAt ? `${companyBranding.faviconUrl}?v=${new Date(companyBranding.brandingUpdatedAt).getTime()}` : companyBranding.faviconUrl} alt="Favicon" className="h-8 w-8 object-contain border rounded" onError={(e) => (e.currentTarget.style.display = "none")} />
                        <input ref={faviconFileInputRef} type="file" accept=".png,image/png" className="hidden" onChange={async (e) => {
                          const file = e.target.files?.[0]
                          if (!file || !companyBranding || companyBranding.pricingTier !== "WHITE_LABEL") return
                          if (file.size > 300 * 1024) { alert("Favicon must be 300 KB or smaller"); return }
                          setFaviconUploading(true)
                          try {
                            const fd = new FormData(); fd.append("file", file)
                            const res = await fetch("/api/admin/branding/favicon", { method: "POST", body: fd })
                            if (res.ok) handleRefresh()
                            else { const d = await res.json(); alert(d.error || "Upload failed") }
                          } finally { setFaviconUploading(false); e.target.value = "" }
                        }} />
                        <Button type="button" variant="outline" size="sm" disabled={faviconUploading || !companyBranding || companyBranding.pricingTier !== "WHITE_LABEL"} onClick={() => faviconFileInputRef.current?.click()}>
                          {faviconUploading ? "Uploading…" : "Replace"}
                        </Button>
                      </div>
                    ) : (
                      <div className="mt-1">
                        <input ref={faviconFileInputRef} type="file" accept=".png,image/png" className="hidden" onChange={async (e) => {
                          const file = e.target.files?.[0]
                          if (!file || !companyBranding || companyBranding.pricingTier !== "WHITE_LABEL") return
                          if (file.size > 300 * 1024) { alert("Favicon must be 300 KB or smaller"); return }
                          setFaviconUploading(true)
                          try {
                            const fd = new FormData(); fd.append("file", file)
                            const res = await fetch("/api/admin/branding/favicon", { method: "POST", body: fd })
                            if (res.ok) handleRefresh()
                            else { const d = await res.json(); alert(d.error || "Upload failed") }
                          } finally { setFaviconUploading(false); e.target.value = "" }
                        }} />
                        <Button type="button" variant="outline" size="sm" disabled={faviconUploading || !companyBranding || companyBranding.pricingTier !== "WHITE_LABEL"} onClick={() => faviconFileInputRef.current?.click()}>
                          {faviconUploading ? "Uploading…" : "Upload favicon"}
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Primary color</label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={brandForm.brandPrimaryColor || "#2563eb"}
                          onChange={(e) => setBrandForm((f) => ({ ...f, brandPrimaryColor: e.target.value }))}
                          className="h-10 w-14 cursor-pointer rounded border"
                          disabled={!companyBranding || companyBranding.pricingTier !== "WHITE_LABEL"}
                          title={!companyBranding || companyBranding.pricingTier !== "WHITE_LABEL" ? "Only available for White Label tier" : undefined}
                        />
                        <input
                          type="text"
                          value={brandForm.brandPrimaryColor}
                          onChange={(e) => setBrandForm((f) => ({ ...f, brandPrimaryColor: e.target.value }))}
                          placeholder="#2563eb"
                          className="flex-1 px-3 py-2 border rounded-md"
                          disabled={!companyBranding || companyBranding.pricingTier !== "WHITE_LABEL"}
                          title={!companyBranding || companyBranding.pricingTier !== "WHITE_LABEL" ? "Only available for White Label tier" : undefined}
                        />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Use a 6-digit hex color (example: #0EA5E9).
                      </p>
                    </div>
                  </div>
                  {companyBranding?.pricingTier === "WHITE_LABEL" && (
                    <Button onClick={handleSaveBranding} disabled={brandSaving}>
                      {brandSaving ? "Saving…" : "Save branding"}
                    </Button>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

            <CreateHomeDialog
              open={createHomeOpen}
              onOpenChange={(open) => {
                setCreateHomeOpen(open)
                if (!open) {
                  // Reset selected subdivision when dialog closes if needed
                }
              }}
              onSuccess={() => {
                handleRefresh()
                if (selectedSubdivisionId) {
                  // Keep the selected subdivision view
                }
              }}
              refreshSubdivisions={refreshSubdivisions}
              preselectedSubdivisionId={selectedSubdivisionId || undefined}
            />
        <CreateSubdivisionDialog
          open={createSubdivisionOpen}
          onOpenChange={setCreateSubdivisionOpen}
          onSuccess={() => {
            handleRefresh()
            setRefreshSubdivisions((prev) => prev + 1)
          }}
        />
        <CreateTemplateDialog
          open={createTemplateOpen}
          onOpenChange={(open) => {
            setCreateTemplateOpen(open)
            if (!open) setCreateTemplateCategoryId(null)
          }}
          onSuccess={handleRefresh}
          defaultWorkTemplateCategoryId={createTemplateCategoryId}
        />
        <ImportTemplatesDialog
          open={importTemplatesOpen}
          onOpenChange={setImportTemplatesOpen}
          onSuccess={handleRefresh}
        />
            <CreateContractorDialog
              open={createContractorOpen}
              onOpenChange={setCreateContractorOpen}
              onSuccess={handleRefresh}
            />
            <ImportContractorsDialog
              open={importContractorsOpen}
              onOpenChange={setImportContractorsOpen}
              onSuccess={handleRefresh}
            />
            <CreateUserDialog
              open={createUserOpen}
              onOpenChange={setCreateUserOpen}
              onSuccess={handleRefresh}
            />
            <Dialog
              open={subSearchOpen}
              onOpenChange={(open) => {
                setSubSearchOpen(open)
                if (!open) {
                  setSubSearchQuery("")
                  setSubSearchResults([])
                  setSubSearchError(null)
                  setSubSearchLoading(false)
                }
              }}
            >
              <DialogContent className="max-w-xl">
                <DialogHeader>
                  <DialogTitle>Search Phase directory</DialogTitle>
                  <p className="text-sm text-muted-foreground">
                    Search subcontractors by name, company, email, or phone. Results show masked contact
                    details and whether they already have a Phase account.
                  </p>
                </DialogHeader>
                <form onSubmit={handleSubSearchSubmit} className="space-y-4">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={subSearchQuery}
                      onChange={(e) => setSubSearchQuery(e.target.value)}
                      className="flex-1 px-3 py-2 border rounded-md text-sm"
                      placeholder="Search name, company, email, or phone"
                    />
                    <Button type="submit" disabled={subSearchLoading || !subSearchQuery.trim()}>
                      {subSearchLoading ? "Searching..." : "Search"}
                    </Button>
                  </div>
                  {subSearchError && <p className="text-sm text-destructive">{subSearchError}</p>}
                </form>
                <div className="mt-4 space-y-2 max-h-80 overflow-y-auto">
                  {subSearchResults.length === 0 && !subSearchLoading && !subSearchError && (
                    <p className="text-sm text-muted-foreground">No results yet. Try a search above.</p>
                  )}
                  {subSearchResults.map((r) => (
                    <div
                      key={r.contractorDirectoryId}
                      className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                    >
                      <div>
                        <p className="font-medium">
                          {r.displayName}
                          {r.companyName ? ` — ${r.companyName}` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {r.maskedEmail || "No email"} · {r.maskedPhone || "No phone"}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {r.alreadyLinkedToTenant && (
                            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
                              Already in your company
                            </span>
                          )}
                          {r.hasUserAccount && (
                            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
                              Has Phase account
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {r.alreadyLinkedToTenant ? (
                          <span className="text-xs text-muted-foreground">Linked</span>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleLinkExistingSubcontractor(r.contractorDirectoryId)}
                          >
                            <Link2 className="h-3 w-3 mr-1" />
                            {r.hasUserAccount ? "Link to my company" : "Link / invite"}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
            <Dialog
              open={inviteContactOpen}
              onOpenChange={(open) => {
                setInviteContactOpen(open)
                if (!open) {
                  setInviteContactVendorId(null)
                  setInviteContactName("")
                  setInviteContactEmail("")
                  setInviteContactError("")
                }
              }}
            >
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Invite Contact</DialogTitle>
                  <p className="text-sm text-muted-foreground">
                    {inviteContactVendorId && contractors.find((c) => c.id === inviteContactVendorId)?.companyName
                      ? `Send an invite to a contact for ${contractors.find((c) => c.id === inviteContactVendorId)?.companyName}. They will set their password and opt in to SMS.`
                      : "Send an invite email. The contact will set their password and opt in to SMS."}
                  </p>
                </DialogHeader>
                <form onSubmit={handleInviteContactSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Name</label>
                    <input
                      type="text"
                      value={inviteContactName}
                      onChange={(e) => setInviteContactName(e.target.value)}
                      className="w-full px-3 py-2 border rounded-md"
                      placeholder="Contact name"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Email</label>
                    <input
                      type="email"
                      value={inviteContactEmail}
                      onChange={(e) => setInviteContactEmail(e.target.value)}
                      className="w-full px-3 py-2 border rounded-md"
                      placeholder="email@example.com"
                      required
                    />
                  </div>
                  {inviteContactError && (
                    <p className="text-sm text-destructive">{inviteContactError}</p>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setInviteContactOpen(false)
                        setInviteContactVendorId(null)
                      }}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={inviteContactLoading}>
                      {inviteContactLoading ? "Sending..." : "Send invite"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
            <EditUserDialog
              open={editUserOpen}
              onOpenChange={(open) => {
                setEditUserOpen(open)
                if (!open) setEditingUser(null)
              }}
              onSuccess={handleRefresh}
              user={editingUser}
            />
            <Dialog open={manualInviteOpen} onOpenChange={(open) => {
              setManualInviteOpen(open)
              if (!open) {
                setManualInviteLink(null)
                setManualInviteMessage(null)
                setManualInviteError(null)
              }
            }}>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Email failed – copy invite link</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 text-sm">
                  <p className="text-muted-foreground">{manualInviteMessage}</p>
                  {manualInviteError && (
                    <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">{manualInviteError}</p>
                  )}
                  {manualInviteLink && (() => {
                    const displayLink = sanitizeUrl(manualInviteLink)
                    let linkValid = false
                    try { new URL(displayLink); linkValid = true } catch { /* invalid */ }
                    return (
                      <div className="flex flex-col gap-2">
                        {!linkValid && (
                          <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 text-xs">Link format invalid; copy and fix manually if needed.</p>
                        )}
                        <div className="flex gap-2">
                          <input
                            type="text"
                            readOnly
                            value={displayLink}
                            className="flex-1 min-w-0 rounded border bg-muted/50 px-2 py-1.5 text-xs font-mono"
                          />
                          <Button type="button" size="sm" onClick={() => navigator.clipboard.writeText(displayLink)}>
                            Copy
                          </Button>
                        </div>
                      </div>
                    )
                  })()}
                  <p className="text-muted-foreground">Send this link to the user manually (e.g. by email or message). The link was rotated and is valid for 48 hours.</p>
                </div>
              </DialogContent>
            </Dialog>
            {selectedSubdivisionId && selectedSubdivision && (
              <ImportHomesDialog
                open={importHomesOpen}
                onOpenChange={setImportHomesOpen}
                onSuccess={handleRefresh}
                subdivisionId={selectedSubdivisionId}
                subdivisionName={selectedSubdivision.name}
              />
            )}
      </div>
      {planViewerHome && (
        <PlanViewer
          homeId={planViewerHome.id}
          addressOrLot={planViewerHome.addressOrLot}
          planName={planViewerHome.planName}
          planVariant={planViewerHome.planVariant}
          open={planViewerOpen}
          onOpenChange={(open) => {
            setPlanViewerOpen(open)
            if (!open) setPlanViewerHome(null)
          }}
        />
      )}
    </div>
  )
}
