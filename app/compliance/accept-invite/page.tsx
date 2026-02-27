"use client"

import { useState } from "react"
import Image from "next/image"
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card"
import { AcceptInviteForm } from "@/components/invites/AcceptInviteForm"
import logoImage from "../../../public/logo.png"

export const dynamic = "force-dynamic"

/**
 * Public, non-expiring compliance proof page.
 * Mirrors the subcontractor accept-invite UI (phone + SMS consent + Terms) but does NOT validate a token or create accounts.
 * Use this URL for Twilio verification and audits: /compliance/accept-invite
 */
export default function ComplianceAcceptInvitePage() {
  const [demoMessage, setDemoMessage] = useState("")

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="relative mx-auto mb-6 flex h-9 w-28 items-center justify-center sm:h-10 sm:w-32 md:h-[3.2rem] md:w-48 lg:h-[3.2rem] lg:w-52">
          <Image
            src={logoImage}
            alt="Phase"
            fill
            className="object-contain object-center"
            priority
            unoptimized
            sizes="(min-width: 1024px) 416px, (min-width: 768px) 384px, 256px"
          />
        </div>

        <Card className="w-full">
          <CardHeader>
            <CardDescription>
              This page demonstrates the SMS opt-in workflow for compliance review.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AcceptInviteForm
              mode="demo"
              invitedName="Invited Subcontractor"
              invitedEmail="invited@example.com"
              showSubcontractorFields={true}
              onSubmit={() => setDemoMessage("Demo compliance page: no account is created.")}
              demoMessage={demoMessage}
              submitButtonLabel="Submit"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
