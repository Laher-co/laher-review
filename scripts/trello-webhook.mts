// Manages the Trello webhook that adds "Open in LAHER Studio" links.
// Uses TRELLO_API_KEY / TRELLO_TOKEN (the LAHER Review App user).
//   npm run trello:webhook -- list
//   npm run trello:webhook -- register https://review.laher.co
//   npm run trello:webhook -- delete <webhook id>
const BOARD = '6298669bf6dbcc7f66baa38d' // Laher // Order Management
const key = process.env.TRELLO_API_KEY!.replace(/^"|"$/g, ''), token = process.env.TRELLO_TOKEN!.replace(/^"|"$/g, '')
const api = async (method: string, path: string, body?: unknown) => {
  const r = await fetch(`https://api.trello.com/1${path}${path.includes('?') ? '&' : '?'}key=${key}&token=${token}`, {
    method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined,
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`${method} ${path.split('?')[0]} → ${r.status} ${t.slice(0, 200)}`)
  return t ? JSON.parse(t) : null
}

const [cmd, arg] = process.argv.slice(2)
if (cmd === 'list') {
  const hooks = await api('GET', `/tokens/${token}/webhooks`)
  for (const h of hooks) console.log(h.id, h.active ? 'active' : 'INACTIVE', h.idModel === BOARD ? 'Order Management' : h.idModel, h.callbackURL)
  if (!hooks.length) console.log('No webhooks.')
} else if (cmd === 'register') {
  if (!arg?.startsWith('https://')) throw new Error('Usage: register https://review.laher.co')
  const hook = await api('POST', '/webhooks', {
    idModel: BOARD, callbackURL: `${arg.replace(/\/$/, '')}/api/webhooks/trello`,
    description: 'LAHER Studio: add "Open in LAHER Studio" links',
  })
  console.log('Registered', hook.id, hook.callbackURL)
} else if (cmd === 'delete') {
  await api('DELETE', `/webhooks/${arg}`)
  console.log('Deleted', arg)
} else {
  console.log('Usage: list | register <base url> | delete <id>')
}
