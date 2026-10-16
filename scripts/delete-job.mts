// Permanently deletes a job (versions, renders, messages, events) and its
// uploaded files. For clearing test jobs only.
// Run: npm run db:delete-job -- <job id>
import { neon } from '@neondatabase/serverless'
import { del, list } from '@vercel/blob'

const jobId = process.argv[2]
if (!jobId) throw new Error('Usage: npm run db:delete-job -- <job id>')
const sql = neon(process.env.DATABASE_URL!)

const [job] = await sql`select customer_name, customer_email from jobs where id = ${jobId}`
if (!job) throw new Error(`No job with id ${jobId}`)

let deleted = 0
for (const prefix of [`renders/${jobId}/`, `annotations/${jobId}/`, `email-attachments/${jobId}/`]) {
  const { blobs } = await list({ prefix })
  if (blobs.length) await del(blobs.map(b => b.url))
  deleted += blobs.length
}
await sql`delete from webhook_events where job_id = ${jobId}`
await sql`delete from emails where job_id = ${jobId}`
await sql`delete from jobs where id = ${jobId}`
console.log(`Deleted job for ${job.customer_name} <${job.customer_email}> and ${deleted} files.`)
