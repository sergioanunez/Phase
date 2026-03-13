"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { signOut, useSession } from "next-auth/react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { LogOut, MessageSquare, MoreVertical, Settings, HelpCircle } from "lucide-react"

export function UserMenu() {
  const router = useRouter()
  const { data: session } = useSession()
  const [impersonationRole, setImpersonationRole] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/super-admin/impersonation/context")
      .then((res) => res.json())
      .then((data) => setImpersonationRole(data.active && data.role ? data.role : null))
      .catch(() => setImpersonationRole(null))
  }, [])

  const role = impersonationRole ?? (session?.user as { role?: string })?.role ?? ""
  const canAccessSettings = role === "Admin"
  const canAccessMessages = role === "Admin" || role === "Manager" || role === "Superintendent"
  const canStartTour = role === "Admin" || role === "Manager"

  if (!session?.user) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 shrink-0 rounded-full hover:bg-muted transition-colors"
          title="Menu"
        >
          <MoreVertical className="h-5 w-5" />
          <span className="sr-only">User menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">
              {session.user?.name ?? "User"}
            </p>
            <p className="text-xs leading-none text-muted-foreground">
              {session.user?.role ?? ""}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {canAccessMessages && (
          <DropdownMenuItem
            onClick={() => router.push("/messages")}
            className="cursor-pointer"
          >
            <MessageSquare className="mr-2 h-4 w-4" />
            <span>Messages</span>
          </DropdownMenuItem>
        )}
        {canAccessSettings && (
          <DropdownMenuItem
            onClick={() => router.push("/admin")}
            className="cursor-pointer"
          >
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </DropdownMenuItem>
        )}
        {canStartTour && (
          <DropdownMenuItem
            onClick={() => router.push("/dashboard?tour=onboarding")}
            className="cursor-pointer"
          >
            <HelpCircle className="mr-2 h-4 w-4" />
            <span>Start guided tour</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onClick={() => signOut({ callbackUrl: "/auth/signin" })}
          className="cursor-pointer"
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>Sign out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
