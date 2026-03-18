export function normalizeEmail(email?: string | null): string | null {
  if (!email) return null
  const trimmed = email.trim()
  if (!trimmed) return null
  return trimmed.toLowerCase()
}

export function normalizePhone(phone?: string | null): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, "")
  return digits.length ? digits : null
}

