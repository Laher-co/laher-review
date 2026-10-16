// Customer email templates: branded, short and mobile friendly. Pure
// functions (no sending) so the Studio can preview every one of them.

export type EmailContent = { subject: string; html: string; text: string }

type Common = {
  firstName: string
  designer: string
  pageUrl: string            // the customer's review page
  ringSizeNeeded: boolean    // ring size still unconfirmed → add the reminder line
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function layout(c: Common, o: {
  heading: string
  paragraphs: string[]          // already-escaped HTML
  quote?: string                // plain text, shown as a soft block
  list?: string[]               // plain text bullet points
  after?: string[]              // already-escaped HTML, shown after the quote/list
  button: { label: string; href: string }
  skipRingLine?: boolean
}) {
  const ringLine = c.ringSizeNeeded && !o.skipRingLine
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#F8F4EE;-webkit-text-size-adjust:100%">
<div style="max-width:560px;margin:0 auto;padding:32px 22px;font-family:Helvetica,Arial,sans-serif;color:#2B211B;font-size:16px;line-height:1.6">
  <p style="font-family:Georgia,'Times New Roman',serif;letter-spacing:.32em;font-size:20px;color:#36231A;margin:0 0 28px">LAHER</p>
  <h1 style="font-family:Georgia,'Times New Roman',serif;font-weight:normal;font-size:26px;line-height:1.25;color:#36231A;margin:0 0 18px">${esc(o.heading)}</h1>
  <p style="margin:0 0 14px">Hi ${esc(c.firstName)},</p>
  ${o.paragraphs.map(p => `<p style="margin:0 0 14px">${p}</p>`).join('\n  ')}
  ${o.quote ? `<div style="margin:6px 0 18px;padding:14px 16px;background:#F1EAE0;border-radius:10px;white-space:pre-line">${esc(o.quote)}</div>` : ''}
  ${o.list?.length ? `<ul style="margin:6px 0 18px;padding-left:20px">${o.list.map(l => `<li style="margin:0 0 6px">${esc(l)}</li>`).join('')}</ul>` : ''}
  ${(o.after ?? []).map(p => `<p style="margin:0 0 14px">${p}</p>`).join('\n  ')}
  <p style="margin:24px 0 28px"><a href="${o.button.href}" style="display:inline-block;background:#4A3022;color:#F8F4EE;text-decoration:none;padding:15px 24px;border-radius:10px;font-size:16px">${esc(o.button.label)}</a></p>
  ${ringLine ? `<div style="margin:0 0 24px;padding:14px 16px;border:1px solid #E4D9CB;border-radius:10px;background:#FFFFFF">
    <strong>Please confirm your ring size.</strong> We need it before your ring can go into production.
    <a href="${c.pageUrl}#ring-size" style="color:#4A3022">Add my ring size</a>
  </div>` : ''}
  <p style="margin:0;color:#8C7B6E;font-size:14px">Please reply on <a href="${c.pageUrl}" style="color:#4A3022">your design page</a> rather than by email, so ${esc(c.designer)} sees it straight away.</p>
  <p style="margin:26px 0 0;color:#8C7B6E;font-size:13px">LAHER · Bespoke fine jewellery, Sydney</p>
</div></body></html>`

  const strip = (h: string) => h.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  const text = [
    `Hi ${c.firstName},`,
    ...o.paragraphs.map(strip),
    o.quote ?? '',
    ...(o.list ?? []).map(l => `• ${l}`),
    ...(o.after ?? []).map(strip),
    `${o.button.label}: ${o.button.href}`,
    ringLine ? `Please confirm your ring size. We need it before your ring can go into production: ${c.pageUrl}#ring-size` : '',
    `Please reply on your design page rather than by email, so ${c.designer} sees it straight away: ${c.pageUrl}`,
    'LAHER · Bespoke fine jewellery, Sydney',
  ].filter(Boolean).join('\n\n')

  return { html, text }
}

// ── The emails ────────────────────────────────────────────────────────────────

export function versionReady(c: Common & { versionTitle: string; versionNumber: number; optionCount: number; note: string | null }): EmailContent {
  const first = c.versionNumber === 1
  const subject = first ? `Your design is ready, ${c.firstName}` : `${c.versionTitle} of your design is ready`
  return {
    subject,
    ...layout(c, {
      heading: first ? 'Your bespoke design is ready' : `${c.versionTitle} is ready`,
      paragraphs: [
        `${esc(c.designer)} has finished ${first ? 'the first version of your design' : `<strong>${esc(c.versionTitle)}</strong> with your changes`}.${c.optionCount > 1 ? ` There are ${c.optionCount} options for you to choose from.` : ''}`,
        'Take a look, then approve it or tell us what you’d like changed. You can draw on the design to show us.',
      ],
      quote: c.note ? `${c.designer}: ${c.note.length > 280 ? `${c.note.slice(0, 280)}…` : c.note}` : undefined,
      button: { label: 'View your design', href: c.pageUrl },
    }),
  }
}

export function staffReplied(c: Common & { staffName: string; body: string }): EmailContent {
  return {
    subject: 'You have a new message about your design',
    ...layout(c, {
      heading: 'You have a new message',
      paragraphs: [`${esc(c.staffName)} from the LAHER studio replied:`],
      quote: c.body.length > 400 ? `${c.body.slice(0, 400)}…` : c.body,
      button: { label: 'Read and reply', href: c.pageUrl },
    }),
  }
}

export function approvedSummary(c: Common & { what: string; comments: string | null; sizeOutstanding: boolean }): EmailContent {
  return {
    subject: `Thank you, you’ve approved ${c.what}`,
    ...layout(c, {
      heading: 'Thank you for approving your design',
      paragraphs: [
        `You’ve approved <strong>${esc(c.what)}</strong>.`,
        c.sizeOutstanding
          ? `<strong>What happens next:</strong> before production can start we need your ring size. Our team will be in touch to help you confirm it, then ${esc(c.designer)} will prepare your design for production.`
          : `<strong>What happens next:</strong> ${esc(c.designer)} will prepare your design for production, and we’ll be in touch about the next steps.`,
      ],
      quote: c.comments ? `Your note: ${c.comments}` : undefined,
      button: { label: 'View your design', href: c.pageUrl },
    }),
  }
}

export function changesSummary(c: Common & { what: string; changes: string[]; comments: string | null; drawings: number }): EmailContent {
  return {
    subject: `We’ve received your changes to ${c.what}`,
    ...layout(c, {
      heading: 'We’ve received your changes',
      paragraphs: [
        `Here’s what you asked for on <strong>${esc(c.what)}</strong>${c.drawings ? ` (with ${c.drawings} drawing${c.drawings > 1 ? 's' : ''})` : ''}:`,
      ],
      list: [...c.changes, ...(c.comments ? [`Comments: ${c.comments}`] : [])],
      after: [`<strong>What happens next:</strong> ${esc(c.designer)} will work on your changes, and we’ll email you as soon as the next version is ready.`],
      button: { label: 'View your design', href: c.pageUrl },
    }),
  }
}

const DESIGN_REMINDERS = [
  { subject: 'Your design is ready for your feedback', heading: 'Your design is waiting for you',
    line: (d: string) => `${esc(d)} would love to hear what you think of your design. When you have a moment, take a look and let us know.` },
  { subject: 'A gentle reminder: your design is waiting', heading: 'Just a gentle reminder',
    line: (d: string) => `Your design is ready and waiting. Approve it, or tell ${esc(d)} what you’d like changed. It only takes a minute.` },
  { subject: 'We’d love your thoughts on your design', heading: 'We’d love your thoughts',
    line: () => 'We haven’t heard from you yet, so we wanted to check in. If anything’s unclear or you’d like to chat it through, just send us a message on your page.' },
]

export function designReminder(c: Common & { n: 1 | 2 | 3 }): EmailContent {
  const r = DESIGN_REMINDERS[c.n - 1]
  return {
    subject: r.subject,
    ...layout(c, { heading: r.heading, paragraphs: [r.line(c.designer)], button: { label: 'View your design', href: c.pageUrl } }),
  }
}

const SIZE_REMINDERS = [
  { subject: 'Please confirm your ring size', heading: 'We need your ring size',
    line: 'Thank you for approving your design. Before it can go into production, we need your ring size.' },
  { subject: 'Reminder: we need your ring size', heading: 'A reminder about your ring size',
    line: 'Your design is approved and ready to go. We just need your ring size before production can start.' },
  { subject: 'Your ring size: last reminder', heading: 'Your ring size',
    line: 'We still need your ring size to start making your ring. If you’re unsure, send us a message on your page and we’ll help you measure.' },
]

export function sizeReminder(c: Common & { n: 1 | 2 | 3 }): EmailContent {
  const r = SIZE_REMINDERS[c.n - 1]
  return {
    subject: r.subject,
    ...layout(c, {
      heading: r.heading,
      paragraphs: [r.line, 'Not sure of your size? Send us a message on your page and we’ll help.'],
      button: { label: 'Add my ring size', href: `${c.pageUrl}#ring-size` },
      skipRingLine: true,
    }),
  }
}
