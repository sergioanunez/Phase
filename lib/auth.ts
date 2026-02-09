import { NextAuthOptions } from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import CredentialsProvider from "next-auth/providers/credentials"
import { prisma } from "./prisma"
import { UserRole } from "@prisma/client"
import bcrypt from "bcryptjs"

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as any,
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          include: { contractor: true }
        })

        if (!user) {
          return null
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
          companyId: user.companyId ?? null,
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
        token.companyId = user.companyId
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
  },
  pages: {
    signIn: "/auth/signin",
  },
}
