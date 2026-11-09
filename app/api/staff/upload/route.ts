import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { SESSION_COOKIE, verifySession } from '@/lib/session'
import { getOptionContext } from '@/lib/jobs'
import { eq } from 'drizzle-orm'
import { db, staff } from '@/lib/db'

// Issues short-lived tokens so the browser can upload renders straight to
// Vercel Blob (no 4.5 MB function body limit). Staff-only via middleware;
// checked again here. The render is saved to the database by the addRender
// server action once the upload finishes.
export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const session = await verifySession(cookies().get(SESSION_COOKIE)?.value)
        if (!session) throw new Error('Not signed in.')

        const payload = JSON.parse(clientPayload ?? '{}') as { optionId?: string; settingImage?: string; clusterImage?: string }

        // Irregular cluster style images (Studio → Settings): Ryan only
        if (payload.clusterImage) {
          const [me] = await db.select({ role: staff.role }).from(staff).where(eq(staff.id, session.staffId))
          if (me?.role !== 'owner') throw new Error('Only Ryan can change these images.')
          if (!pathname.startsWith('clusters/')) throw new Error('Invalid upload path.')
          return {
            allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
            maximumSizeInBytes:  20 * 1024 * 1024,
            addRandomSuffix:     true,
          }
        }

        // Setting question images (Studio → Settings): Ryan only
        if (payload.settingImage) {
          const [me] = await db.select({ role: staff.role }).from(staff).where(eq(staff.id, session.staffId))
          if (me?.role !== 'owner') throw new Error('Only Ryan can change these images.')
          if (!pathname.startsWith('settings/')) throw new Error('Invalid upload path.')
          return {
            allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
            maximumSizeInBytes:  20 * 1024 * 1024,
            addRandomSuffix:     true,
          }
        }

        const { optionId } = payload
        const ctx = optionId ? await getOptionContext(optionId) : null
        if (!ctx) throw new Error('Option not found.')
        if (ctx.version.status !== 'draft') throw new Error('This version is already published.')
        if (!pathname.startsWith(`renders/${ctx.job.id}/`)) throw new Error('Invalid upload path.')

        return {
          allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'],
          maximumSizeInBytes:  50 * 1024 * 1024,
          addRandomSuffix:     true,
        }
      },
    })
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Upload failed.' }, { status: 400 })
  }
}
