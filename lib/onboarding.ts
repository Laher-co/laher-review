// "Welcome to LAHER Bespoke" onboarding page: wording and rules. Pure, so it's unit tested.

export const LABEL_ONBOARDING = 'ONBOARDING LINK'
export const LABEL_SETTING_QUESTION = 'SETTING QUESTION'

export const onboardingPath = (publicCode: string) => `/r/${publicCode}/welcome`

export const onboardingLinkComment = (url: string) => `Onboarding link: ${url}`
export const newQuestionComment = (url: string) =>
  `New question added – let the customer know there’s more to answer on their page: ${url}`

/** "irregular cluster" anywhere in the card description (any case) switches the question on. */
export const mentionsIrregularCluster = (desc: string | null | undefined) => /irregular\s+cluster/i.test(desc ?? '')

export const irregularClusterOn = (j: { irregularClusterAuto: boolean; irregularClusterOverride: boolean | null }) =>
  j.irregularClusterOverride ?? j.irregularClusterAuto

export type ClusterStyle = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G'
export const CLUSTER_STYLES: { key: ClusterStyle; heading: string; line: string }[] = [
  { key: 'A', heading: 'Single Side Cluster',       line: 'Suits freeforms with one single long edge.' },
  { key: 'B', heading: 'Asymmetrical Cluster',      line: 'Main cluster on one side, with a micro cluster on the other.' },
  { key: 'C', heading: 'Cluster + Micro Cluster',   line: 'Suits smaller or squared freeform cuts.' },
  { key: 'D', heading: 'East-West Style',           line: 'The centre stone is set on its side, across the finger.' },
  { key: 'E', heading: 'Half/Quarter Bezel',        line: 'The centre stone has a quarter or half bezel.' },
  { key: 'F', heading: 'Champagne Diamond Cluster', line: 'The cluster uses champagne and white diamonds.' },
  { key: 'G', heading: 'Single Accent Stone',       line: 'Instead of a cluster, one larger single accent stone.' },
]
export const isClusterStyle = (v: unknown): v is ClusterStyle => CLUSTER_STYLES.some(s => s.key === v)
/** In A–G order, without repeats. */
export const cleanClusterStyles = (input: unknown): ClusterStyle[] =>
  Array.isArray(input) ? CLUSTER_STYLES.map(s => s.key).filter(k => input.includes(k)) : []
export const clusterLabel = (k: ClusterStyle) => `${k}. ${CLUSTER_STYLES.find(s => s.key === k)!.heading}`

export function clusterComment(styles: ClusterStyle[], changed: boolean) {
  return `**IRREGULAR CLUSTER${changed ? ' (changed)' : ''}: ${styles.map(clusterLabel).join(', ')}**`
}
export function answerComment(question: string, answer: string, changed: boolean) {
  return `**CUSTOMER ANSWER${changed ? ' (changed)' : ''}**\nQ: ${question}\nA: ${answer}`
}
export function notesComment(body: string, photoCount: number) {
  const photos = photoCount ? `(${photoCount} inspiration photo${photoCount > 1 ? 's' : ''}: see LAHER Studio)` : ''
  return [`**NOTES FOR THE DESIGNER (from the customer)**`, body.trim(), photos].filter(Boolean).join('\n\n')
}

export type SectionKey = 'size' | 'setting' | 'cluster' | 'questions'
export type OnboardingInput = {
  ringSizeStatus: 'unconfirmed' | 'submitted' | 'confirmed'
  ringSizeNotSureAt: Date | string | null
  sizeConfirmedByCustomer: boolean      // confirmed through the page (it was unconfirmed when they started)
  settingQuestion: boolean
  settingChoice: string | null
  settingNotNeeded: boolean
  clusterOn: boolean
  clusterSavedAt: Date | string | null
  questions: { answer: string | null }[]
}

/**
 * The sections that count towards "X of Y done", and which are done. Only the
 * ones that apply to this customer: ring size only if it was unconfirmed,
 * setting only with SETTING QUESTION, cluster only if switched on, staff
 * questions only if there are any (all answered = done).
 */
export function onboardingProgress(i: OnboardingInput) {
  const sections: { key: SectionKey; done: boolean }[] = []
  const sizeUnconfirmed = i.ringSizeStatus !== 'confirmed'
  if (sizeUnconfirmed || i.sizeConfirmedByCustomer || i.ringSizeNotSureAt) {
    sections.push({ key: 'size', done: !sizeUnconfirmed || !!i.ringSizeNotSureAt })
  }
  if (i.settingQuestion && !i.settingNotNeeded) sections.push({ key: 'setting', done: !!i.settingChoice })
  if (i.clusterOn) sections.push({ key: 'cluster', done: !!i.clusterSavedAt })
  if (i.questions.length) sections.push({ key: 'questions', done: i.questions.every(q => !!q.answer?.trim()) })
  return { sections, done: sections.filter(s => s.done).length, total: sections.length }
}

/** Ring size counts as unconfirmed if the status says so, or the size itself says "tbc". */
export const sizeUnconfirmed = (status: string, size: string | null) => status !== 'confirmed' || /tbc/i.test(size ?? '')

/** The customer's first name for the greeting; nothing if we only have an email. */
export function firstNameOf(customerName: string) {
  const first = customerName.trim().split(/\s+/)[0] ?? ''
  return first.includes('@') ? '' : first
}
