"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  Building2,
  Users,
  MessageSquare,
  AlertTriangle,
  TrendingUp,
  Loader2,
} from "lucide-react"

type Summary = {
  totalCompanies: number
  activeCompanies: number
  totalUsers: number
  smsErrorsLast24h: number
  companiesNearLimit: number
}

type GlanceRow = {
  id: string
  name: string
  tier: string
  status: string
  activeHomes: number
  maxActiveHomes: number | null
  lastActivity: string
  confirmationRate7d: number | null
  smsFailureRate7d: number
}

export default function SuperAdminDashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [glance, setGlance] = useState<GlanceRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch("/api/super-admin/summary").then((r) => r.json()),
      fetch("/api/super-admin/glance").then((r) => r.json()),
    ])
      .then(([summaryData, glanceData]) => {
        if (summaryData.error) throw new Error(summaryData.error)
        setSummary(summaryData)
        setGlance(Array.isArray(glanceData) ? glanceData : [])
      })
      .catch((e) => {
        console.error(e)
        setSummary(null)
        setGlance([])
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading && !summary) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  const s = summary ?? {
    totalCompanies: 0,
    activeCompanies: 0,
    totalUsers: 0,
    smsErrorsLast24h: 0,
    companiesNearLimit: 0,
  }

  const cards = [
    { label: "Total companies", value: s.totalCompanies, icon: Building2 },
    { label: "Active companies", value: s.activeCompanies, icon: TrendingUp },
    { label: "Total users", value: s.totalUsers, icon: Users },
    { label: "SMS errors (24h)", value: s.smsErrorsLast24h, icon: MessageSquare, warn: s.smsErrorsLast24h > 0 },
    { label: "Companies near limit", value: s.companiesNearLimit, icon: AlertTriangle, warn: s.companiesNearLimit > 0 },
  ]

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso)
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    } catch {
      return iso
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900 md:text-2xl">Super Admin Dashboard</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map(({ label, value, icon: Icon, warn }) => (
          <div
            key={label}
            className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-center gap-2 text-gray-500">
              <Icon className={`h-4 w-4 ${warn ? "text-amber-500" : ""}`} />
              <span className="text-sm font-medium">{label}</span>
            </div>
            <p className={`mt-1 text-2xl font-semibold ${warn ? "text-amber-600" : "text-gray-900"}`}>
              {value}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-4 py-3 sm:px-6">
          <h2 className="text-base font-semibold text-gray-900">Companies at a glance</h2>
          <p className="mt-0.5 text-sm text-gray-500">Active and trial companies with usage</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 sm:px-6">
                  Company
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 sm:px-6">
                  Tier
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 sm:px-6">
                  Status
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 sm:px-6">
                  Active homes
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 sm:table-cell sm:px-6">
                  Last activity
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 sm:px-6">
                  Conf. rate (7d)
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 sm:px-6">
                  SMS fail (7d)
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 sm:px-6">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {glance.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500 sm:px-6">
                    No companies to show
                  </td>
                </tr>
              ) : (
                glance.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900 sm:px-6">
                      <Link
                        href={`/super-admin/companies/${row.id}`}
                        className="text-primary hover:underline"
                      >
                        {row.name}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600 sm:px-6">
                      <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                        {row.tier}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm sm:px-6">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          row.status === "ACTIVE"
                            ? "bg-green-100 text-green-800"
                            : row.status === "TRIAL"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-600 sm:px-6">
                      {row.activeHomes} / {row.maxActiveHomes ?? "∞"}
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-sm text-gray-500 sm:table-cell sm:px-6">
                      {formatDate(row.lastActivity)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-600 sm:px-6">
                      {row.confirmationRate7d != null ? `${row.confirmationRate7d}%` : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm sm:px-6">
                      <span className={row.smsFailureRate7d > 10 ? "text-red-600 font-medium" : "text-gray-600"}>
                        {row.smsFailureRate7d}%
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm sm:px-6">
                      <Link
                        href={`/super-admin/companies/${row.id}`}
                        className="text-primary hover:underline font-medium"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-gray-200 px-4 py-2 sm:px-6">
          <Link
            href="/super-admin/companies"
            className="text-sm font-medium text-primary hover:underline"
          >
            View all companies →
          </Link>
        </div>
      </div>
    </div>
  )
}
