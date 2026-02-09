"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Navigation } from "@/components/navigation"
import { CreateHomeDialog } from "@/components/create-home-dialog"
import { CreateSubdivisionDialog } from "@/components/create-subdivision-dialog"
import { CreateTemplateDialog } from "@/components/create-template-dialog"
import { ImportTemplatesDialog } from "@/components/import-templates-dialog"
import { CreateContractorDialog } from "@/components/create-contractor-dialog"
import { CreateUserDialog } from "@/components/create-user-dialog"
import { EditUserDialog } from "@/components/edit-user-dialog"
import { ImportHomesDialog } from "@/components/import-homes-dialog"
import { Plus, Trash2, Upload, Edit2, Check, X, ArrowLeft, ChevronRight, Lock, Settings, GitBranch, FileText, Mail, Palette } from "lucide-react"
import { PlanViewer } from "@/components/plan-viewer"
import { format } from "date-fns"
import { useRef } from "react"

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

interface WorkTemplateItem {
  id: string
  name: string
  defaultDurationDays: number
  sortOrder: number
  optionalCategory: string | null
  isDependency: boolean
  isCriticalGate: boolean
  gateScope: "DownstreamOnly" | "AllScheduling"
  gateBlockMode: "ScheduleOnly" | "ScheduleAndConfirm"
  gateName: string | null
  dependencies?: Array<{
    dependsOnItemId: string
    dependsOnItem: {
      id: string
      name: string
    } | null
  }>
}

interface Contractor {
  id: string
  companyName: string
  contactName: string
  phone: string
  email: string | null
  trade: string | null
  preferredNoticeDays: number | null
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
  const [createUserOpen, setCreateUserOpen] = useState(false)
  const [editUserOpen, setEditUserOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null)
  const [refreshSubdivisions, setRefreshSubdivisions] = useState(0)
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
  const [editingTemplateName, setEditingTemplateName] = useState("")
  const [editingTemplateDuration, setEditingTemplateDuration] = useState("")
  const [editingTemplateOrder, setEditingTemplateOrder] = useState("")
  const [editingTemplateCategory, setEditingTemplateCategory] = useState("")
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
  const [editingContractorId, setEditingContractorId] = useState<string | null>(null)
  const [editingContractor, setEditingContractor] = useState({
    companyName: "",
    contactName: "",
    phone: "",
    email: "",
    trade: "",
    preferredNoticeDays: "",
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

  useEffect(() => {
    if (session?.user?.role !== "Admin") {
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
    ])
      .then(([subs, homesData, templatesData, contractorsData, usersData, branding]) => {
        setSubdivisions(subs)
        setHomes(homesData)
        setTemplates(templatesData)
        setContractors(contractorsData)
        setUsers(usersData)
        setCompanyBranding(branding ?? null)
        if (branding) {
          setBrandForm({
            brandAppName: branding.brandAppName ?? "",
            brandPrimaryColor: branding.brandPrimaryColor ?? "",
            brandAccentColor: branding.brandAccentColor ?? "",
          })
        }
        setLoading(false)
      })
      .catch((err) => {
        console.error("Admin fetch error:", err)
        setSubdivisions([])
        setHomes([])
        setTemplates([])
        setContractors([])
        setUsers([])
        setCompanyBranding(null)
        setCategoryGates([])
        setLoading(false)
      })
  }, [session, router])

  const handleRefresh = () => {
    Promise.all([
      fetch("/api/subdivisions").then((res) => res.json()),
      fetch("/api/homes").then((res) => res.json()),
      fetch("/api/templates").then((res) => res.json()),
      fetch("/api/contractors").then((res) => res.json()),
      fetch("/api/users").then((res) => res.json()),
      fetch("/api/category-gates").then((res) => res.json()),
      fetch("/api/company/branding").then(async (res) => (res.ok ? res.json() : null)),
    ])
      .then(([subs, homesData, templatesData, contractorsData, usersData, gatesData, branding]) => {
        setSubdivisions(Array.isArray(subs) ? subs : [])
        setHomes(Array.isArray(homesData) ? homesData : [])
        setTemplates(Array.isArray(templatesData) ? templatesData : [])
        setContractors(Array.isArray(contractorsData) ? contractorsData : [])
        setUsers(Array.isArray(usersData) ? usersData : [])
        setCategoryGates(Array.isArray(gatesData) ? gatesData : [])
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
  }

  const handleCancelEditTemplate = () => {
    setEditingTemplateId(null)
    setEditingTemplateName("")
    setEditingTemplateDuration("")
    setEditingTemplateOrder("")
    setEditingTemplateCategory("")
  }

  const handleSaveTemplate = async (id: string) => {
    if (!editingTemplateName.trim()) {
      alert("Template name cannot be empty")
      return
    }

    const duration = parseInt(editingTemplateDuration)
    if (isNaN(duration) || duration <= 0) {
      alert("Duration must be a positive number")
      return
    }

    const order = parseInt(editingTemplateOrder)
    if (isNaN(order)) {
      alert("Order must be a number")
      return
    }

    try {
      const updateData: any = {
        name: editingTemplateName.trim(),
        defaultDurationDays: duration,
        sortOrder: order,
        optionalCategory: editingTemplateCategory.trim() || null,
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
    setResendInviteUserId(userId)
    try {
      const res = await fetch(`/api/admin/users/${userId}/resend-invite`, {
        method: "POST",
      })
      const data = await res.json()
      if (res.ok) {
        handleRefresh()
        alert("Invite email sent.")
      } else {
        alert(data.error || "Failed to resend invite")
      }
    } catch (err) {
      console.error("Resend invite error:", err)
      alert("Failed to resend invite")
    } finally {
      setResendInviteUserId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div>Loading...</div>
      </div>
    )
  }

  if (session?.user?.role !== "Admin") {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-100 pb-24 pt-20">
      <div className="app-container">
        <h1 className="text-2xl font-bold">Admin Management</h1>
        <p className="mt-1.5 mb-6 text-sm text-muted-foreground">
          Manage subdivisions, homes, work templates, contractors, and users. Admin only.
        </p>

        <Tabs defaultValue="subdivisions-homes" className="w-full">
          <TabsList className="flex flex-wrap gap-2 w-full mb-6">
            <TabsTrigger value="subdivisions-homes" className="flex-shrink-0">
              Subdivisions & Homes
            </TabsTrigger>
            <TabsTrigger value="work-templates" className="flex-shrink-0">Work Items Template</TabsTrigger>
            <TabsTrigger value="contractors" className="flex-shrink-0">Contractors</TabsTrigger>
            <TabsTrigger value="users" className="flex-shrink-0">Users</TabsTrigger>
            <TabsTrigger value="white-label" className="flex-shrink-0">
              <Palette className="h-4 w-4 mr-1" />
              White Label
            </TabsTrigger>
          </TabsList>

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
            <div className="flex gap-2 flex-wrap mb-6">
              <Button
                onClick={() => setCreateTemplateOpen(true)}
                variant="outline"
                size="sm"
              >
                <Plus className="h-4 w-4 mr-1" />
                New Work Item
              </Button>
              <Button
                onClick={() => setImportTemplatesOpen(true)}
                variant="outline"
                size="sm"
              >
                <Upload className="h-4 w-4 mr-1" />
                Import from Excel
              </Button>
            </div>

            {/* Work Items Template Section */}
            <div>
              <h2 className="text-xl font-semibold mb-4">Work Items Template</h2>
              <p className="text-sm text-muted-foreground mb-4">
                These are the work items that will be automatically created for each new home.
              </p>
              
              {(() => {
                // Group templates by category
                const templatesByCategory = templates.reduce((acc, template) => {
                  const category = template.optionalCategory || "Uncategorized"
                  if (!acc[category]) {
                    acc[category] = []
                  }
                  acc[category].push(template)
                  return acc
                }, {} as Record<string, WorkTemplateItem[]>)

                // Category order (Preliminary work first)
                const categoryOrder = [
                  "Preliminary work",
                  "Foundation",
                  "Structural",
                  "Interior finishes / exterior rough work",
                  "Finals punches and inspections.",
                  "Pre-sale completion package",
                ]

                // Sort categories - Preliminary work always first
                const sortedCategories = Object.keys(templatesByCategory).sort((a, b) => {
                  const aLower = a.toLowerCase().trim()
                  const bLower = b.toLowerCase().trim()
                  
                  // Normalize "prelliminary" typo to "preliminary" for sorting
                  const aNormalized = aLower.replace("prelliminary", "preliminary")
                  const bNormalized = bLower.replace("prelliminary", "preliminary")
                  
                  // Preliminary always comes FIRST
                  const aIsPreliminary = aNormalized.includes("preliminary")
                  const bIsPreliminary = bNormalized.includes("preliminary")
                  
                  if (aIsPreliminary && !bIsPreliminary) return -1
                  if (!aIsPreliminary && bIsPreliminary) return 1
                  if (aIsPreliminary && bIsPreliminary) {
                    return a.localeCompare(b)
                  }
                  
                  // Use predefined order
                  const aIndex = categoryOrder.findIndex(
                    (orderCat) => orderCat.toLowerCase().trim() === aLower
                  )
                  const bIndex = categoryOrder.findIndex(
                    (orderCat) => orderCat.toLowerCase().trim() === bLower
                  )
                  
                  if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex
                  if (aIndex !== -1) return -1
                  if (bIndex !== -1) return 1
                  
                  return a.localeCompare(b)
                })

                if (templates.length === 0) {
                  return (
                    <p className="text-muted-foreground text-center py-8">
                      No work items template. Create one to get started.
                    </p>
                  )
                }

                return (
                  <Accordion type="multiple" className="w-full">
                    {sortedCategories.map((category) => {
                      const categoryTemplates = templatesByCategory[category]
                      // Sort templates within category by sortOrder
                      const sortedTemplates = [...categoryTemplates].sort((a, b) => a.sortOrder - b.sortOrder)

                      return (
                        <AccordionItem key={category} value={category}>
                          <AccordionTrigger className="hover:no-underline">
                            <div className="flex items-center justify-between w-full pr-4">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold">
                                  {category.replace(/Prelliminary/gi, "Preliminary")}
                                </span>
                                {categoryGates.some((gate) => gate.categoryName === category) && (
                                  <span className="text-xs bg-orange-100 dark:bg-orange-900/20 text-orange-800 dark:text-orange-400 px-2 py-1 rounded">
                                    Gate
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleToggleCategoryGate(category)
                                  }}
                                  variant="ghost"
                                  size="sm"
                                  className={categoryGates.some((gate) => gate.categoryName === category)
                                    ? "text-orange-600 hover:text-orange-700 dark:text-orange-400"
                                    : "text-muted-foreground hover:text-foreground"
                                  }
                                  title={categoryGates.some((gate) => gate.categoryName === category)
                                    ? "Remove category gate (all tasks in this category must be completed before next category)"
                                    : "Mark category as gate (all tasks in this category must be completed before next category)"
                                  }
                                >
                                  <Lock className={`h-4 w-4 ${categoryGates.some((gate) => gate.categoryName === category) ? "fill-current" : ""}`} />
                                </Button>
                                <span className="text-sm text-muted-foreground">
                                  ({categoryTemplates.length} item{categoryTemplates.length !== 1 ? "s" : ""})
                                </span>
                              </div>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="space-y-3 pt-2">
                              {sortedTemplates.map((template) => (
                                <Card key={template.id}>
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
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <CardTitle 
                                className="text-lg cursor-pointer hover:text-primary transition-colors"
                                onClick={() => handleStartEditTemplate(template)}
                              >
                                {template.name}
                              </CardTitle>
                            </div>
                          )}
                          {editingTemplateId !== template.id && (
                            <div className="flex gap-4 mt-2 text-sm text-muted-foreground items-center flex-wrap">
                              <span>Duration: {template.defaultDurationDays} days</span>
                              <span>Order: {template.sortOrder}</span>
                              {template.optionalCategory && (
                                <span>Category: {template.optionalCategory}</span>
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
                                item can be scheduled. Dependencies are managed by Admin only.
                              </p>
                              <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
                                {templates
                                  .filter((t) => t.id !== template.id)
                                  .sort((a, b) => a.sortOrder - b.sortOrder)
                                  .map((t) => (
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
                              ))}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      )
                    })}
                  </Accordion>
                )
              })()}
            </div>
          </TabsContent>

          <TabsContent value="contractors" className="space-y-8">
            <div className="flex gap-2 flex-wrap mb-6">
              <Button
                onClick={() => setCreateContractorOpen(true)}
                variant="outline"
                size="sm"
              >
                <Plus className="h-4 w-4 mr-1" />
                New Contractor
              </Button>
            </div>

            {/* Contractors Section */}
            <div>
              <h2 className="text-xl font-semibold mb-4">Contractors</h2>
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
                                <label className="text-xs text-muted-foreground">Phone</label>
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
                                  placeholder="Phone"
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
                            <span className="font-medium">Phone: </span>
                            {contractor.phone}
                          </div>
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
                          {contractor.preferredNoticeDays && (
                            <div>
                              <span className="font-medium">Preferred Notice: </span>
                              {contractor.preferredNoticeDays} day(s)
                            </div>
                          )}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                ))}
                {contractors.length === 0 && (
                  <p className="text-muted-foreground text-center py-8">
                    No contractors. Create one to get started.
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
                Add Superintendents, Managers, Admins, and Subcontractors. Subcontractors must be linked to a contractor company (e.g. plumbing, electrical).
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
                    Customize how your company name, logo, and colors appear in the app.
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Accent color</label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={brandForm.brandAccentColor || "#0ea5e9"}
                          onChange={(e) => setBrandForm((f) => ({ ...f, brandAccentColor: e.target.value }))}
                          className="h-10 w-14 cursor-pointer rounded border"
                          disabled={!companyBranding || companyBranding.pricingTier !== "WHITE_LABEL"}
                          title={!companyBranding || companyBranding.pricingTier !== "WHITE_LABEL" ? "Only available for White Label tier" : undefined}
                        />
                        <input
                          type="text"
                          value={brandForm.brandAccentColor}
                          onChange={(e) => setBrandForm((f) => ({ ...f, brandAccentColor: e.target.value }))}
                          placeholder="#0ea5e9"
                          className="flex-1 px-3 py-2 border rounded-md"
                          disabled={!companyBranding || companyBranding.pricingTier !== "WHITE_LABEL"}
                          title={!companyBranding || companyBranding.pricingTier !== "WHITE_LABEL" ? "Only available for White Label tier" : undefined}
                        />
                      </div>
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
          onOpenChange={setCreateTemplateOpen}
          onSuccess={handleRefresh}
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
            <CreateUserDialog
              open={createUserOpen}
              onOpenChange={setCreateUserOpen}
              onSuccess={handleRefresh}
            />
            <EditUserDialog
              open={editUserOpen}
              onOpenChange={(open) => {
                setEditUserOpen(open)
                if (!open) setEditingUser(null)
              }}
              onSuccess={handleRefresh}
              user={editingUser}
            />
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
      <Navigation />
    </div>
  )
}
