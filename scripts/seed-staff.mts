// Adds or updates the staff name-picker entries (role and email).
// Safe to re-run. Run: npm run db:seed
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { sql } from 'drizzle-orm'
import { staff } from '../lib/db/schema.ts'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set.')
const db = drizzle(neon(url))

type Role = 'designer' | 'va' | 'escalations' | 'owner'
const people: { name: string; role: Role; email: string | null }[] = [
  { name: 'Heather',   role: 'designer',    email: null },
  { name: 'Tara',      role: 'designer',    email: null },
  { name: 'Rehan',     role: 'designer',    email: null },
  { name: 'Ekaterina', role: 'designer',    email: null },
  { name: 'Jane',      role: 'va',          email: 'hello@leiedesign.com' },
  { name: 'Rach',      role: 'escalations', email: 'rachel@leiedesign.com' },
  { name: 'Ryan',      role: 'owner',       email: 'hello@leiedesign.com' },
]

await db.insert(staff).values(people)
  .onConflictDoUpdate({ target: staff.name, set: { role: sql`excluded.role`, email: sql`excluded.email` } })
console.log('Staff:', people.map(p => `${p.name} (${p.role})`).join(', '))
