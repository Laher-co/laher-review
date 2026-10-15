import 'server-only'
import type { JobRow } from './jobs'
import { reviewUrl } from './jobs'

/** The job block every v2 webhook carries, so each event stands on its own. */
export function jobPayload(job: JobRow, designerName: string | null) {
  return {
    job: {
      id:            job.id,
      cardId:        job.trelloCardId,
      cardUrl:       job.trelloShortUrl,
      customerName:  job.customerName,
      customerEmail: job.customerEmail,
      designer:      designerName,
      reviewUrl:     reviewUrl(job),
      status:        job.status,
    },
    ringSize: { value: job.ringSize, status: job.ringSizeStatus },
  }
}
