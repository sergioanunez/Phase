import { z } from "zod"

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, "Password must be at least 6 characters"),
  name: z.string().min(1, "Name is required").max(200),
  termsAccepted: z.literal(true, {
    errorMap: () => ({ message: "You must agree to the Terms & Conditions to create an account." }),
  }),
  smsConsent: z.boolean().optional().default(false),
  smsConsentVersion: z.string().optional(),
  /** Optional; passed from trial signup form before company is provisioned. */
  companyName: z.string().max(200).optional(),
  signupSource: z.string().max(200).optional(),
})
