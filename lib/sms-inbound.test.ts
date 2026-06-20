import { describe, it, expect } from "vitest"
import {
  parseInboundSmsReply,
  extractConfirmationCode,
  inboundSmsReplyMessage,
} from "./sms-inbound"
import { phonesMatch, phoneDigits10 } from "./phone"

describe("parseInboundSmsReply", () => {
  it("detects Y and N confirmations", () => {
    expect(parseInboundSmsReply("Y")).toBe("yes")
    expect(parseInboundSmsReply("y")).toBe("yes")
    expect(parseInboundSmsReply("YES")).toBe("yes")
    expect(parseInboundSmsReply("Y Ref: AB12")).toBe("yes")
    expect(parseInboundSmsReply("N")).toBe("no")
    expect(parseInboundSmsReply("NO")).toBe("no")
  })

  it("detects STOP and START compliance keywords without treating as confirmation", () => {
    expect(parseInboundSmsReply("STOP")).toBe("stop")
    expect(parseInboundSmsReply("stop")).toBe("stop")
    expect(parseInboundSmsReply("START")).toBe("start")
    expect(parseInboundSmsReply("UNSTOP")).toBe("start")
    expect(parseInboundSmsReply("HELP")).toBe("help")
  })
})

describe("extractConfirmationCode", () => {
  it("extracts Ref and legacy Code", () => {
    expect(extractConfirmationCode("Y\nRef: nm2855")).toBe("NM2855")
    expect(extractConfirmationCode("Code: ab12cd")).toBe("AB12CD")
  })
})

describe("phonesMatch", () => {
  it("matches E.164, 10-digit, and formatted numbers", () => {
    expect(phonesMatch("+19155551234", "9155551234")).toBe(true)
    expect(phonesMatch("(915) 555-1234", "+19155551234")).toBe(true)
    expect(phoneDigits10("+1 (915) 555-1234")).toBe("9155551234")
    expect(phonesMatch("+19155551234", "+18155551234")).toBe(false)
  })
})

describe("inboundSmsReplyMessage", () => {
  it("returns builder-friendly message when no pending confirmation", () => {
    expect(
      inboundSmsReplyMessage({
        processed: false,
        reason: "no_pending_confirmation",
        replyMessage: "",
      })
    ).toContain("open confirmation request")
  })
})
