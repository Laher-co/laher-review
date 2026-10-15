import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set.')

// The Neon driver queries over HTTP, and Next.js 14 caches server-side fetches
// by default (even on dynamic pages), which served year-old query results.
// no-store makes every query hit the database.
export const db = drizzle(neon(url, { fetchOptions: { cache: 'no-store' } }), { schema })
export * from './schema'
