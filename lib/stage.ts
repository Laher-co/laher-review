// Works out where a job is from the app's own history (what was published
// and how the customer responded, in time order). Deliberately ignores the
// Trello list, so an accidental drag in Trello never shows the customer the
// wrong status.

export type Stage = 'in_design' | 'feedback_needed' | 'alterations' | 'approved' | 'approved_size_needed'
  | 'sourcing_approved' | 'sourcing_new_stone' | 'approved_building' | 'approved_finalising'

export type StageInput = {
  publishedAt: (Date | string | null)[]
  decisions: { decision: 'approved' | 'changes_requested'; sizeOutstanding: boolean; createdAt: Date | string }[]
  ringSizeStatus: 'unconfirmed' | 'submitted' | 'confirmed'
  // While the card is in REQUIRES SOURCING (set and cleared by the app)
  sourcing?: 'approved' | 'new_stone' | null
  // Approved but held in Alterations: building the full design (concept), or finalising (side stones)
  hold?: 'concept' | 'side_stones' | null
  // Staff moved the card out of REQUIRES SOURCING: approved, or back to alterations
  overrides?: { stage: 'approved' | 'alterations'; at: Date | string }[]
}

const t = (d: Date | string | null) => (d ? new Date(d).getTime() : 0)

export function jobStage({ publishedAt, decisions, ringSizeStatus, sourcing, hold, overrides = [] }: StageInput): Stage {
  if (sourcing === 'approved') return 'sourcing_approved'
  if (sourcing === 'new_stone') return 'sourcing_new_stone'
  if (hold === 'concept') return 'approved_building'
  if (hold === 'side_stones') return 'approved_finalising'
  const lastPublish = Math.max(0, ...publishedAt.map(t))
  if (lastPublish === 0) return 'in_design'

  const latest = [...decisions].sort((a, b) => t(b.createdAt) - t(a.createdAt))[0]
  const override = [...overrides].sort((a, b) => t(b.at) - t(a.at))[0]
  // A staff move out of REQUIRES SOURCING since the last publish (and since the customer's last response) wins
  if (override && t(override.at) >= lastPublish && (!latest || t(override.at) > t(latest.createdAt))) {
    return override.stage === 'alterations' ? 'alterations'
      : latest?.decision === 'approved' && latest.sizeOutstanding && ringSizeStatus === 'unconfirmed' ? 'approved_size_needed' : 'approved'
  }
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
  sourcing_approved:    { label: 'Approved',              message: () => 'We’re securing your stone' },
  sourcing_new_stone:   { label: 'Your new stone',        message: () => 'We’re sourcing your new stone' },
  approved_building:    { label: 'Approved',              message: d => `${d} is now building your full design` },
  approved_finalising:  { label: 'Approved',              message: d => `${d} is finalising your design` },
}
