// Adds the staff name-picker entries. Safe to re-run: existing names are kept.
// Run: npm run db:seed
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { staff } from '../lib/db/schema.ts'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set.')
const db = drizzle(neon(url))

const people: { name: string; role: 'designer' | 'va' | 'admin' }[] = [
  { name: 'Heather',   role: 'designer' },
  { name: 'Tara',      role: 'designer' },
  { name: 'Rehan',     role: 'designer' },
  { name: 'Ekaterina', role: 'designer' },
  { name: 'Rach',      role: 'admin' },
  { name: 'Ryan',      role: 'admin' },
]

await db.insert(staff).values(people).onConflictDoNothing({ target: staff.name })
console.log('Staff seeded:', people.map(p => p.name).join(', '))
