"use client"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { ChevronDown } from "lucide-react"
import { HomeCard } from "./home-card"
import type { ScheduleStatus } from "@/lib/schedule-status"

export interface CommunityHome {
  id: string
  addressOrLot: string
  forecastCompletionDate: string | null
  targetCompletionDate: string | null
  subdivision: { id: string; name: string }
  tasks: Array<{
    id: string
    scheduledDate: string | null
    nameSnapshot: string
    contractor: { id: string; companyName: string } | null
  }>
}

export interface CommunityAccordionProps {
  communities: Array<{
    id: string
    name: string
    homes: Array<{ home: CommunityHome; status: ScheduleStatus; progress: number }>
  }>
}

export function CommunityAccordion({ communities }: CommunityAccordionProps) {
  return (
    <Accordion type="multiple" className="w-full space-y-3">
      {communities.map((community) => {
        const { homes } = community
        const total = homes.length
        const atRisk = homes.filter((h) => h.status === "at_risk").length
        const behind = homes.filter((h) => h.status === "behind").length

        return (
          <AccordionItem
            key={community.id}
            value={community.id}
            className="border-b-0 rounded-2xl border border-[#E6E8EF] bg-white px-0 shadow-sm [&[data-state=open]]:border-[#E6E8EF]"
          >
            <AccordionTrigger className="flex list-none items-center gap-2 px-4 py-3 text-left font-semibold hover:no-underline [&[data-state=open]>svg]:rotate-180">
              <span className="flex-1">{community.name}</span>
              <span className="text-sm font-normal text-muted-foreground">
                {total} home{total !== 1 ? "s" : ""}
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </AccordionTrigger>
            <AccordionContent className="border-t border-[#E6E8EF] px-4 pb-4 pt-3">
              {/* Expanded section header: Name · X homes · Y at risk · Z behind */}
              <p className="mb-3 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{community.name}</span>
                {" · "}
                <span>{total} homes</span>
                {atRisk > 0 && (
                  <>
                    {" · "}
                    <span className="text-amber-600">{atRisk} at risk</span>
                  </>
                )}
                {behind > 0 && (
                  <>
                    {" · "}
                    <span className="text-red-600">{behind} behind</span>
                  </>
                )}
              </p>

              <div className="space-y-3">
                {homes.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No homes in this community yet
                  </p>
                ) : (
                  homes.map(({ home, status, progress }) => (
                    <HomeCard
                      key={home.id}
                      home={home}
                      status={status}
                      progress={progress}
                    />
                  ))
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
        )
      })}
    </Accordion>
  )
}
