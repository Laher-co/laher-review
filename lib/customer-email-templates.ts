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
    <strong>Please confirm your ring size</strong> whenever you’re ready. We’ll need it before your ring goes into production,
    and if you’re not sure of it we’re happy to help. <a href="${c.pageUrl}#ring-size" style="color:#4A3022">Add my ring size</a>
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
    ringLine ? `Please confirm your ring size whenever you’re ready. We’ll need it before your ring goes into production, and if you’re not sure of it we’re happy to help: ${c.pageUrl}#ring-size` : '',
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

// Reminders are gentle check-ins: no urgency, no deadlines, no "last reminder".
// The wording changes each time so they never feel automated.
const DESIGN_REMINDERS: { subject: string; heading: string; lines: (d: string) => string[]; button: string }[] = [
  {
    subject: 'Your design is ready whenever you are',
    heading: 'Your design is ready to view',
    lines: d => [
      `Just a quick note to say the design ${esc(d)} created for you is ready to look at, whenever suits you. There’s no rush at all.`,
      'When you’ve had a look, you can approve it or let us know anything you’d like changed, right on your page.',
    ],
    button: 'View your design',
  },
  {
    subject: 'A little note from the LAHER studio',
    heading: 'Just checking in',
    lines: () => [
      'We hope you’re well. We wanted to check in and see whether you’ve had a chance to look at your design. Please take all the time you need.',
      'If anything’s unclear, or you’d like to talk anything through, just send us a message on your page. We’re always happy to help.',
    ],
    button: 'Take a look',
  },
  {
    subject: 'We’re here whenever you need us',
    heading: 'Here whenever you’re ready',
    lines: d => [
      'Choosing the details of your ring is a big decision, and it’s completely fine to take your time with it.',
      `Your design will be waiting on your page whenever you’re ready. If you have questions, want a second opinion or would simply like to chat it through, send us a message there and ${esc(d)} or the team will get back to you.`,
    ],
    button: 'Visit your design page',
  },
]

export function designReminder(c: Common & { n: 1 | 2 | 3 }): EmailContent {
  const r = DESIGN_REMINDERS[c.n - 1]
  return {
    subject: r.subject,
    ...layout(c, { heading: r.heading, paragraphs: r.lines(c.designer), button: { label: r.button, href: c.pageUrl } }),
  }
}

const SIZE_REMINDERS: { subject: string; heading: string; lines: (d: string) => string[]; button: string }[] = [
  {
    subject: 'Your ring size, whenever you’re ready',
    heading: 'Thank you for approving your design',
    lines: d => [
      `We’re so glad you’re happy with your design. The one thing ${esc(d)} will need before making your ring is your ring size.`,
      'Whenever you’re ready, you can add it on your page. If you’re not sure of your size, just send us a message there and we’ll help you work it out.',
    ],
    button: 'Add my ring size',
  },
  {
    subject: 'A quick note about your ring size',
    heading: 'Just checking in',
    lines: () => [
      'We wanted to check in about your ring size. There’s no rush at all.',
      'If you’d like a little help finding it, we’re happy to talk you through a few easy ways to measure. Just send us a message on your page whenever suits you.',
    ],
    button: 'Add my ring size',
  },
  {
    subject: 'Here to help with your ring size',
    heading: 'We’re here to help',
    lines: () => [
      'Finding the right ring size can be tricky, so please take all the time you need.',
      'If it would be easier to talk it through, send us a message on your page and we’ll find a time to chat that suits you. Your approved design is safe with us in the meantime.',
    ],
    button: 'Visit your design page',
  },
]

export function sizeReminder(c: Common & { n: 1 | 2 | 3 }): EmailContent {
  const r = SIZE_REMINDERS[c.n - 1]
  return {
    subject: r.subject,
    ...layout(c, {
      heading: r.heading,
      paragraphs: r.lines(c.designer),
      button: { label: r.button, href: r.button === 'Add my ring size' ? `${c.pageUrl}#ring-size` : c.pageUrl },
      skipRingLine: true,
    }),
  }
}
