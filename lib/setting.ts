// Setting question: how the customer would like their engagement ring and
// wedding band to sit together. Pure (wording and rules), so it's unit tested.

export type SettingChoice = 'high_set' | 'low_set'
export const SETTING_CHOICES: SettingChoice[] = ['high_set', 'low_set']

export const SETTING_QUESTION = 'How would you like your engagement ring and wedding band to sit together?'

export const SETTING_COPY: Record<SettingChoice, { title: string; label: string; points: string[] }> = {
  high_set: {
    title: 'High set with a straight wedding band',
    label: 'HIGH SET – straight wedding band',
    points: [
      'Sits higher off the finger, which allows a straight wedding band to sit right beside it.',
      'For cluster or multi-stone designs, we add a gently swept shank for the strength and structural integrity of the setting.',
      'A beautiful, classic look. If you’d prefer something lower on the finger, see the option below.',
    ],
  },
  low_set: {
    title: 'Low set with a curved wedding band',
    label: 'LOW SET – curved wedding band',
    points: [
      'Sits lower and closer to the finger, in a basket setting.',
      'When you reach the wedding band stage, our designers will create a band that sits flush against your engagement ring, following the curve of the setting.',
    ],
  },
}

export const isSettingChoice = (v: unknown): v is SettingChoice => v === 'high_set' || v === 'low_set'

/**
 * The customer can answer any time, and change their answer until Version One
 * is published. Nothing to do when staff marked the question "Not needed".
 */
export function settingState(job: { settingChoice: SettingChoice | null; settingNotNeeded: boolean }, publishedCount: number):
  'not_needed' | 'open' | 'answered' | 'locked' {
  if (job.settingNotNeeded) return 'not_needed'
  if (!job.settingChoice) return 'open'
  return publishedCount > 0 ? 'locked' : 'answered'
}

/** The one Trello comment posted when the question is answered (or the answer changes). */
export function settingComment(choice: SettingChoice, o: { changed: boolean; staffName?: string | null }) {
  return `**SETTING${o.changed ? ' (changed)' : ''}: ${SETTING_COPY[choice].label}**${o.staffName ? ` (set by ${o.staffName})` : ''}`
}

/** Where the question lives: the design page's private link plus /setting. */
export const settingPath = (publicCode: string) => `/r/${publicCode}/setting`
