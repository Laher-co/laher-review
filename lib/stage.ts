// Works out where a job is from the app's own history (what was published
// and how the customer responded, in time order). Deliberately ignores the
// Trello list, so an accidental drag in Trello never shows the customer the
// wrong status.

export type Stage = 'in_design' | 'feedback_needed' | 'alterations' | 'approved' | 'approved_size_needed'

export type StageInput = {
  publishedAt: (Date | string | null)[]
  decisions: { decision: 'approved' | 'changes_requested'; sizeOutstanding: boolean; createdAt: Date | string }[]
  ringSizeStatus: 'unconfirmed' | 'submitted' | 'confirmed'
}

const t = (d: Date | string | null) => (d ? new Date(d).getTime() : 0)

export function jobStage({ publishedAt, decisions, ringSizeStatus }: StageInput): Stage {
  const lastPublish = Math.max(0, ...publishedAt.map(t))
  if (lastPublish === 0) return 'in_design'

  const latest = [...decisions].sort((a, b) => t(b.createdAt) - t(a.createdAt))[0]
  // A version published after their last response is waiting for them
  if (!latest || t(latest.createdAt) < lastPublish) return 'feedback_needed'

  if (latest.decision === 'changes_requested') return 'alterations'
  if (latest.sizeOutstanding && ringSizeStatus === 'unconfirmed') return 'approved_size_needed'
  return 'approved'
}

export const STAGE_COPY: Record<Stage, { label: string; message: (designer: string) => string }> = {
  in_design:            { label: 'In design',             message: d => `${d} is creating your first design` },
  feedback_needed:      { label: 'Your feedback needed',  message: () => 'Your new design is ready, take a look below' },
  alterations:          { label: 'Design alterations',    message: d => `${d} is working on your changes` },
  approved:             { label: 'Approved',              message: () => 'Your design is going into production' },
  approved_size_needed: { label: 'Approved – size needed', message: () => 'Please confirm your ring size so we can begin' },
}
