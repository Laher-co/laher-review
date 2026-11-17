// Setting question: how the customer would like their engagement ring and
// wedding band to sit together. Pure (wording and rules), so it's unit tested.

export type SettingChoice = 'high_set' | 'low_set'
export const SETTING_CHOICES: SettingChoice[] = ['high_set', 'low_set']

export const SETTING_QUESTION = 'How high should your engagement ring sit?'
export const SETTING_INTRO = 'This only shapes your engagement ring. It decides which style of wedding band will sit beside it later on. You’re not ordering a wedding band now.'

export const SETTING_COPY: Record<SettingChoice, { heading: string; subheading: string; label: string; points: string[] }> = {
  high_set: {
    heading: 'HIGH SET / CATHEDRAL',
    subheading: 'Suits a straight wedding band later',
    label: 'HIGH SET – straight wedding band',
    points: [
      'Sits higher, so a straight band fits right beside it.',
      'Cluster and multi-stone designs get a gently swept shank for strength.',
      'A classic look. Prefer it lower? See the other option.',
    ],
  },
  low_set: {
    heading: 'LOW SET / BASKET',
    subheading: 'Suits a curved or split wedding band later',
    label: 'LOW SET – curved or split wedding band',
    points: [
      'Sits lower, closer to the finger, in a basket setting.',
      'Later, we’ll design a curved or split band to sit flush against it.',
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
