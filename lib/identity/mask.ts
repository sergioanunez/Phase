export function maskEmail(email?: string | null): string | null {
  if (!email) return null
  const [local, domain] = email.split("@")
  if (!local || !domain) return null
  if (local.length <= 1) {
    return `* @${domain}`
  }
  const first = local[0]
  return `${first}${"*".repeat(Math.max(1, Math.min(3, local.length - 1)))}` + `@${domain}`
}

export function maskPhone(phone?: string | null): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, "")
  if (digits.length < 4) return "*".repeat(digits.length)
  const last4 = digits.slice(-4)
  return `(***) ***-${last4}`
}

