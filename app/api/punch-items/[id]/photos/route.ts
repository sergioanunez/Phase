import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requirePermission } from "@/lib/rbac"
import { createId } from "@paralleldrive/cuid2"
import path from "path"
import fs from "fs/promises"

const UPLOAD_DIR = "public/uploads/punch-photos"
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

function isAllowedType(type: string): boolean {
  return type.startsWith("image/") || type === "application/pdf"
}

function getExtension(filename: string, type: string): string {
  const ext = path.extname(filename).toLowerCase()
  if (ext && [".jpg", ".jpeg", ".png", ".gif", ".webp", ".pdf"].includes(ext))
    return ext
  if (type === "application/pdf") return ".pdf"
  if (type.includes("jpeg") || type.includes("jpg")) return ".jpg"
  if (type.includes("png")) return ".png"
  if (type.includes("gif")) return ".gif"
  if (type.includes("webp")) return ".webp"
  return ".jpg"
}

// POST /api/punch-items/[id]/photos - Upload photos/files for a punch item
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requirePermission("homes:write")

    const punchItem = await prisma.punchItem.findUnique({
      where: { id: params.id },
    })

    if (!punchItem) {
      return NextResponse.json(
        { error: "Punch item not found" },
        { status: 404 }
      )
    }

    const formData = await request.formData()
    const files = formData.getAll("files") as File[]

    if (!files.length) {
      return NextResponse.json(
        { error: "No files provided" },
        { status: 400 }
      )
    }

    const dir = path.join(process.cwd(), UPLOAD_DIR)
    await fs.mkdir(dir, { recursive: true })

    const created: Array<{ id: string; imageUrl: string }> = []

    for (const file of files) {
      if (!file.size) continue
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `File ${file.name} exceeds 10 MB limit` },
          { status: 400 }
        )
      }
      const type = file.type?.toLowerCase() || ""
      if (!isAllowedType(type)) {
        return NextResponse.json(
          { error: `File type not allowed: ${file.name}. Use images or PDF.` },
          { status: 400 }
        )
      }

      const ext = getExtension(file.name, type)
      const filename = `${params.id}-${createId()}${ext}`
      const filepath = path.join(dir, filename)

      const buffer = Buffer.from(await file.arrayBuffer())
      await fs.writeFile(filepath, buffer)

      const imageUrl = `/uploads/punch-photos/${filename}`
      const photo = await prisma.punchPhoto.create({
        data: {
          punchItemId: params.id,
          imageUrl,
        },
      })
      created.push({ id: photo.id, imageUrl: photo.imageUrl })
    }

    return NextResponse.json({ created })
  } catch (error: any) {
    console.error("Error uploading punch photos:", error)
    return NextResponse.json(
      { error: error.message || "Failed to upload photos" },
      { status: 500 }
    )
  }
}
