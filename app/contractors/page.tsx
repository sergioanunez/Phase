"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Navigation } from "@/components/navigation"
import { CreateContractorDialog } from "@/components/create-contractor-dialog"
import { Plus, Trash2 } from "lucide-react"

interface Contractor {
  id: string
  companyName: string
  contactName: string
  phone: string
  email: string | null
  trade: string | null
}

export default function ContractorsPage() {
  const { data: session } = useSession()
  const [contractors, setContractors] = useState<Contractor[]>([])
  const [loading, setLoading] = useState(true)
  const [createContractorOpen, setCreateContractorOpen] = useState(false)

  const isAdmin = session?.user?.role === "Admin"

  useEffect(() => {
    fetch("/api/contractors")
      .then((res) => res.json())
      .then((data) => {
        setContractors(data)
        setLoading(false)
      })
      .catch((err) => {
        console.error(err)
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div>Loading...</div>
      </div>
    )
  }

  const handleRefresh = () => {
    setLoading(true)
    fetch("/api/contractors")
      .then((res) => res.json())
      .then((data) => {
        setContractors(data)
        setLoading(false)
      })
      .catch((err) => {
        console.error(err)
        setLoading(false)
      })
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

  return (
    <div className="min-h-screen pb-20 pt-20">
      <div className="container mx-auto p-4 pr-20">
        <div className="flex items-center justify-between mb-6">
          <div className="flex-1">
            <h1 className="text-2xl font-bold mb-3">Contractors</h1>
            {isAdmin && (
              <Button
                onClick={() => setCreateContractorOpen(true)}
                size="sm"
              >
                <Plus className="h-4 w-4 mr-1" />
                New Contractor
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {contractors.map((contractor) => (
            <Card key={contractor.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{contractor.companyName}</CardTitle>
                  {isAdmin && (
                    <Button
                      onClick={() =>
                        handleDeleteContractor(contractor.id, contractor.companyName)
                      }
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardHeader>
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
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {isAdmin && (
        <CreateContractorDialog
          open={createContractorOpen}
          onOpenChange={setCreateContractorOpen}
          onSuccess={handleRefresh}
        />
      )}

      <Navigation />
    </div>
  )
}
