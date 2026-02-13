import { NextAuthOptions } from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import CredentialsProvider from "next-auth/providers/credentials"
import { prisma } from "./prisma"
import { UserRole } from "@prisma/client"
import bcrypt from "bcryptjs"
import { sanitizeTenantSlug } from "./sanitize-tenant"

const MAIN_DOMAIN = "usephase.app"

/** Use this when throwing so the client can show a friendly message. */
export const TENANT_REQUIRED_ERROR = "TenantRequired"

function isMainDomain(): boolean {
  const url = process.env.NEXTAUTH_URL || process.env.VERCEL_URL || ""
  return url.includes(MAIN_DOMAIN)
}

/** Resolve tenant (Company) by slug, email domain, or single-company fallback. Returns null if no tenant required. */
async function resolveTenantForSignIn(
  email: string,
  tenantSlugRaw?: string | null
): Promise<{ companyId: string; resolution: "slug" | "email_domain" | "single" } | null> {
  const tenantSlug = sanitizeTenantSlug(tenantSlugRaw)
  const emailLower = email.trim().toLowerCase()
  const domain = emailLower.includes("@") ? emailLower.split("@")[1]! : ""

  if (tenantSlug) {
    const company = await prisma.company.findUnique({
      where: { slug: tenantSlug },
      select: { id: true },
    })
    if (company) {
      if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
        console.log("[auth] tenant_resolution=slug slug=" + tenantSlug)
      }
      return { companyId: company.id, resolution: "slug" }
    }
    throw new Error("No tenant found for slug \"" + tenantSlug + "\". Please check the URL or contact support.")
  }

  if (domain) {
    const company = await prisma.company.findFirst({
      where: { allowedEmailDomains: { has: domain } },
      select: { id: true },
    })
    if (company) {
      if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
        console.log("[auth] tenant_resolution=email_domain domain=" + domain)
      }
      return { companyId: company.id, resolution: "email_domain" }
    }
    // Allow platform users (companyId: null) when domain has no tenant - e.g. superadmin@usephase.app
    const isAppDomain = domain === MAIN_DOMAIN || (typeof process !== "undefined" && process.env.NEXTAUTH_URL?.includes(domain))
    if (isMainDomain() || isAppDomain) {
      const platformUser = await prisma.user.findFirst({
        where: { email: emailLower, companyId: null },
        select: { id: true },
      })
      if (platformUser) {
        if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
          console.log("[auth] tenant_resolution=none (platform user)")
        }
        return null
      }
      throw new Error("No tenant found for email domain \"" + domain + "\". Please contact your administrator.")
    }
  }

  const count = await prisma.company.count()
  if (count === 1) {
    const company = await prisma.company.findFirst({ select: { id: true } })
    if (company) {
      if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
        console.log("[auth] tenant_resolution=single")
      }
      return { companyId: company.id, resolution: "single" }
    }
  }
  if (count > 1) {
    throw new Error(TENANT_REQUIRED_ERROR)
  }

  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    console.log("[auth] tenant_resolution=none")
  }
  return null
}

if (typeof process !== "undefined" && process.env.NODE_ENV === "production" && !process.env.NEXTAUTH_URL) {
  console.warn("[auth] NEXTAUTH_URL is missing in production; cookies may not work correctly.")
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as any,
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        tenantSlug: { label: "Tenant", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const emailLower = credentials.email.trim().toLowerCase()
        const tenantSlug = sanitizeTenantSlug((credentials as { tenantSlug?: string }).tenantSlug)
        const tenant = await resolveTenantForSignIn(credentials.email, tenantSlug)

        let user: Awaited<ReturnType<typeof prisma.user.findUnique>> = null
        if (tenant) {
          const found = await prisma.user.findFirst({
            where: {
              email: emailLower,
              companyId: tenant.companyId,
            },
            include: { contractor: true },
          })
          user = found
          if (!user) {
            throw new Error(
              "No user found for this email in tenant. Please check the email or contact your administrator."
            )
          }
        } else {
          user = await prisma.user.findUnique({
            where: { email: emailLower },
            include: { contractor: true },
          })
          if (!user) {
            return null
          }
        }

        if (user.status === "INVITED") {
          throw new Error("Check your email to set your password and activate your account.")
        }
        if (user.status === "DISABLED" || !user.isActive) {
          throw new Error("Account disabled. Contact support.")
        }

        if (!user.passwordHash) {
          return null
        }

        const isValid = await bcrypt.compare(credentials.password, user.passwordHash)

        if (!isValid) {
          return null
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          contractorId: user.contractorId,
          companyId: user.companyId ?? undefined,
        }
      }
    })
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role
        token.contractorId = user.contractorId
        token.companyId = user.companyId ?? null
      }
      return token
    },
    async session({ session, token }) {
      if (session?.user) {
        session.user.id = token?.sub ?? ""
        session.user.role = (token?.role as UserRole) ?? "Subcontractor"
        session.user.contractorId = (token?.contractorId as string | null) ?? null
        let companyId = (token?.companyId as string | null) ?? null
        if (!companyId && token?.sub) {
          const u = await prisma.user.findUnique({
            where: { id: token.sub as string },
            select: { companyId: true },
          })
          if (u?.companyId) companyId = u.companyId
        }
        session.user.companyId = companyId
      }
      return session
    },
    redirect({ url, baseUrl }) {
      if (typeof url === "string" && url.startsWith("/")) return `${baseUrl}${url}`
      try {
        const u = new URL(url, baseUrl)
        if (u.origin === new URL(baseUrl).origin) return url
      } catch {
        // ignore
      }
      return `${baseUrl}/dashboard`
    },
  },
  pages: {
    signIn: "/auth/signin",
    error: "/auth/signin", // avoid /api/auth/error (can 500 if env/DB issues); show error on signin via ?error=
  },
}
