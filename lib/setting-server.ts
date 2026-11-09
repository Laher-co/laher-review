import 'server-only'
import { eq } from 'drizzle-orm'
import { db, jobs, kv } from './db'
import { logEvent } from './events'
import { tracked } from './issues'
import { settingComment, type SettingChoice } from './setting'

type Job = typeof jobs.$inferSelect

// The two option images, uploaded by Ryan in Studio → Settings (placeholders until then)
const IMAGES_KEY = 'setting_images'
export type SettingImages = Partial<Record<SettingChoice, { url: string; pathname: string }>>

export async function getSettingImages(): Promise<SettingImages> {
  const [row] = await db.select().from(kv).where(eq(kv.key, IMAGES_KEY))
  return (row?.value as SettingImages | undefined) ?? {}
}

export async function setSettingImage(choice: SettingChoice, image: { url: string; pathname: string } | null) {
  const current = await getSettingImages()
  const next: SettingImages = { ...current }
  if (image) next[choice] = image
  else delete next[choice]
  await db.insert(kv).values({ key: IMAGES_KEY, value: next })
    .onConflictDoUpdate({ target: kv.key, set: { value: next, updatedAt: new Date() } })
  return current[choice] ?? null   // the replaced image, so the caller can delete it
}

/**
 * Records the answer (customer or staff) and posts one Trello comment. The same
 * answer again does nothing. No emails, reminders or webhooks (phase 1).
 */
export async function recordSettingChoice(job: Job, choice: SettingChoice, by: { staffId: string; name: string } | null) {
  if (job.settingChoice === choice) return { changed: false }
  const changed = !!job.settingChoice
  await db.update(jobs).set({
    settingChoice: choice, settingChoiceAt: new Date(), settingChoiceBy: by?.staffId ?? null, updatedAt: new Date(),
  }).where(eq(jobs.id, job.id))
  await tracked('trello_comment', job.id, 'Post the setting answer on the Trello card', {
    type: 'trello.comment', args: { cardId: job.trelloCardId, text: settingComment(choice, { changed, staffName: by?.name }) },
  })
  await logEvent(job.id, by?.staffId ?? null, 'setting_chosen', { choice, from: job.settingChoice, by: by ? 'staff' : 'customer' })
  return { changed: true }
}
