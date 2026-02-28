import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Safe charset: no O/0, I/1 to avoid confusion in SMS. 6–8 chars, uppercase alphanumeric. */
const CONFIRMATION_CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

export function generateConfirmationCode(): string {
  let code = ""
  for (let i = 0; i < 6; i++) {
    code += CONFIRMATION_CODE_CHARS.charAt(
      Math.floor(Math.random() * CONFIRMATION_CODE_CHARS.length)
    )
  }
  return code
}

export function formatPhoneNumber(phone: string): string {
  // Remove all non-digit characters
  const cleaned = phone.replace(/\D/g, "")
  
  // Format as (XXX) XXX-XXXX
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`
  }
  
  return phone
}
