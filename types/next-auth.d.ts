import { UserRole } from "@prisma/client"
import "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      email: string
      name: string
      role: UserRole
      contractorId: string | null
      companyId: string | null
    }
  }

  interface User {
    role: UserRole
    contractorId: string | null
    companyId?: string
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: UserRole
    contractorId: string | null
    companyId: string | null
  }
}
