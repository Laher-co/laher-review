// Customer email templates. Written as warm, personal notes from the LAHER
// studio team to someone they're making something special for: first name,
// the designer's name, short, one button to their design page, and never
// pushy (no urgency, deadlines or "final reminder"). Pure functions so the
// Studio can preview every one and tests can check the tone.

export type EmailContent = { subject: string; html: string; text: string }

export type Common = {
  firstName: string
  designer: string
  pageUrl: string               // the customer's design page
  ringSizeNeeded: boolean       // ring size still unconfirmed → add the gentle ring size line
  ringSizeHint?: string | null  // e.g. "M" when the card said "M (tbc)"
  replyByEmail?: boolean        // replies to this email come back into the app
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const around = (hint?: string | null) =>
  hint ? (/^(around|about|approx)/i.test(hint) ? ` (we’ve noted ${hint})` : ` (we’ve noted around ${hint})`) : ''

function layout(c: Common, o: {
  heading: string
  paragraphs: string[]          // already-escaped HTML
  quote?: { label: string; text: string }
  list?: string[]               // plain text
  after?: string[]              // already-escaped HTML, after the quote/list
  button: { label: string; href?: string }
  skipRingLine?: boolean
}) {
  const ringLine = c.ringSizeNeeded && !o.skipRingLine
  const href = o.button.href ?? c.pageUrl
  const ringHtml = `Please confirm your ring size whenever you’re ready${esc(around(c.ringSizeHint))}. ${esc(c.designer)} will need it before making your ring, and if you’re unsure we’d love to help.`
  const replyHtml = c.replyByEmail
    ? `Simply reply to this email or leave a note on <a href="${c.pageUrl}" style="color:#4A3022">your design page</a>, and it will come straight to ${esc(c.designer)} and the team.`
    : `If you’d like to reply, please leave a note on <a href="${c.pageUrl}" style="color:#4A3022">your design page</a> so ${esc(c.designer)} sees it straight away.`

  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#F8F4EE;-webkit-text-size-adjust:100%">
<div style="max-width:560px;margin:0 auto;padding:32px 22px;font-family:Helvetica,Arial,sans-serif;color:#2B211B;font-size:16px;line-height:1.6">
  <p style="font-family:Georgia,'Times New Roman',serif;letter-spacing:.32em;font-size:20px;color:#36231A;margin:0 0 28px">LAHER</p>
  <h1 style="font-family:Georgia,'Times New Roman',serif;font-weight:normal;font-size:26px;line-height:1.25;color:#36231A;margin:0 0 18px">${esc(o.heading)}</h1>
  <p style="margin:0 0 14px">Hi ${esc(c.firstName)},</p>
  ${o.paragraphs.map(p => `<p style="margin:0 0 14px">${p}</p>`).join('\n  ')}
  ${o.quote ? `<div style="margin:6px 0 18px;padding:14px 16px;background:#F1EAE0;border-radius:10px"><p style="margin:0 0 4px;font-size:13px;color:#7A5A47">${esc(o.quote.label)}</p><div style="white-space:pre-line">${esc(o.quote.text)}</div></div>` : ''}
  ${o.list?.length ? `<ul style="margin:6px 0 18px;padding-left:20px">${o.list.map(l => `<li style="margin:0 0 6px">${esc(l)}</li>`).join('')}</ul>` : ''}
  ${(o.after ?? []).map(p => `<p style="margin:0 0 14px">${p}</p>`).join('\n  ')}
  <p style="margin:24px 0 28px"><a href="${href}" style="display:inline-block;background:#4A3022;color:#F8F4EE;text-decoration:none;padding:15px 24px;border-radius:10px;font-size:16px">${esc(o.button.label)}</a></p>
  ${ringLine ? `<p style="margin:0 0 22px;padding:14px 16px;border:1px solid #E4D9CB;border-radius:10px;background:#FFFFFF;font-size:15px">${ringHtml}</p>` : ''}
  <p style="margin:0 0 20px">With love,<br>${esc(c.designer)} &amp; the LAHER studio</p>
  <p style="margin:0;color:#8C7B6E;font-size:14px">${replyHtml}</p>
</div></body></html>`

  const strip = (h: string) => h.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  const text = [
    `Hi ${c.firstName},`,
    ...o.paragraphs.map(strip),
    o.quote ? `${o.quote.label}\n${o.quote.text}` : '',
    ...(o.list ?? []).map(l => `• ${l}`),
    ...(o.after ?? []).map(strip),
    `${o.button.label}: ${href}`,
    ringLine ? strip(ringHtml) + ` ${c.pageUrl}#ring-size` : '',
    `With love,\n${c.designer} & the LAHER studio`,
    strip(replyHtml) + ` ${c.pageUrl}`,
  ].filter(Boolean).join('\n\n')

  return { html, text }
}

// ── New version ready (on Publish) ────────────────────────────────────────────

export function versionReady(c: Common & { versionTitle: string; versionNumber: number; optionCount: number; note: string | null }): EmailContent {
  const d = esc(c.designer)
  const note = c.note ? { label: `A note from ${c.designer}`, text: c.note.length > 320 ? `${c.note.slice(0, 320)}…` : c.note } : undefined
  if (c.versionNumber === 1) {
    return {
      subject: `${c.firstName}, your design is ready to see`,
      ...layout(c, {
        heading: 'Your design is ready',
        paragraphs: [
          `${d} has been bringing your ring to life, and we’re so excited to share the first design with you.${c.optionCount > 1 ? ` There are ${c.optionCount} directions to explore, each with its own character.` : ''}`,
          'Take your time looking through it. When you’re ready, you can approve it or tell us anything you’d love to change, and you can even draw on the design to show us.',
        ],
        quote: note,
        button: { label: 'See your design' },
      }),
    }
  }
  return {
    subject: `${c.firstName}, ${c.versionTitle} of your design is ready`,
    ...layout(c, {
      heading: `${c.versionTitle} is ready`,
      paragraphs: [
        `Thank you for sharing your thoughts. ${d} has worked them into <strong>${esc(c.versionTitle)}</strong>, and we think you’re going to love how your ring is coming together.${c.optionCount > 1 ? ` There are ${c.optionCount} options to choose from this time.` : ''}`,
        'Have a look whenever suits you, and let us know what you think.',
      ],
      quote: note,
      button: { label: `See ${c.versionTitle}` },
    }),
  }
}

// ── Staff replied ─────────────────────────────────────────────────────────────

export function staffReplied(c: Common & { staffName: string; body: string }): EmailContent {
  return {
    subject: `A message from ${c.staffName} at LAHER`,
    ...layout(c, {
      heading: 'You have a new message',
      paragraphs: [`${esc(c.staffName)} from the studio has replied to you.`],
      quote: { label: `${c.staffName} wrote`, text: c.body.length > 500 ? `${c.body.slice(0, 500)}…` : c.body },
      after: ['We’re always happy to help with anything at all.'],
      button: { label: 'Read your message' },
    }),
  }
}

// ── Summaries ─────────────────────────────────────────────────────────────────

export function approvedSummary(c: Common & { what: string; comments: string | null; sizeOutstanding: boolean }): EmailContent {
  const d = esc(c.designer)
  return {
    subject: `Thank you, ${c.firstName}. We’re so excited to make your ring`,
    ...layout(c, {
      heading: 'Thank you for approving your design',
      paragraphs: [
        `We’re thrilled you love <strong>${esc(c.what)}</strong>. It’s a beautiful choice, and ${d} can’t wait to see it made.`,
        c.sizeOutstanding
          ? `The one thing we still need is your ring size. There’s no rush at all: whenever you’re ready, add it on your page, or send us a message and we’ll happily help you work it out. Once we have it, ${d} will prepare everything for production.`
          : `${d} will now prepare everything for production, and we’ll be in touch about the next steps.`,
      ],
      quote: c.comments ? { label: 'Your note', text: c.comments } : undefined,
      button: { label: c.sizeOutstanding ? 'Add my ring size' : 'See your design', href: c.sizeOutstanding ? `${c.pageUrl}#ring-size` : undefined },
      skipRingLine: c.sizeOutstanding,
    }),
  }
}

export function changesSummary(c: Common & { what: string; changes: string[]; comments: string | null; drawings: number }): EmailContent {
  return {
    subject: `Thank you, ${c.firstName}. We have your thoughts on ${c.what}`,
    ...layout(c, {
      heading: 'Thank you for your feedback',
      paragraphs: [
        `Thank you for taking the time to share your thoughts on <strong>${esc(c.what)}</strong>${c.drawings ? ` (and your drawing${c.drawings > 1 ? 's' : ''})` : ''}. Here’s what we’ve noted:`,
      ],
      list: [...c.changes, ...(c.comments ? [`Your note: ${c.comments}`] : [])],
      after: [`${esc(c.designer)} is looking forward to working these into your next version, and we’ll let you know as soon as it’s ready to see.`],
      button: { label: 'See your design' },
    }),
  }
}

// ── Gentle check-ins ──────────────────────────────────────────────────────────
// Different wording each time so they never feel automated.

export function designReminder(c: Common & { n: 1 | 2 | 3 }): EmailContent {
  const d = esc(c.designer)
  const r = [
    {
      subject: `Your design is ready whenever you are, ${c.firstName}`,
      heading: 'Ready whenever you are',
      paragraphs: [
        `Just a little note to say the design ${d} created for you is ready to see, whenever suits you. There’s no rush at all.`,
        'We’d love to hear what you think when you’ve had a chance to look.',
      ],
      button: 'See your design',
    },
    {
      subject: 'A little note from the LAHER studio',
      heading: 'Just checking in',
      paragraphs: [
        'We hope your week is going well. We wanted to check in and see whether you’ve had a moment to look at your design. Please take all the time you need.',
        'If anything’s unclear, or you’d like to talk anything through, just send us a message. We’re always happy to help.',
      ],
      button: 'Take a look',
    },
    {
      subject: `We’re here whenever you’re ready, ${c.firstName}`,
      heading: 'Here whenever you’re ready',
      paragraphs: [
        'Choosing the details of something this special is a big decision, and it’s completely fine to take your time with it.',
        `${d} and the team are here whenever you’d like to talk it through, ask a question or get a second opinion. Just send us a message.`,
      ],
      button: 'Visit your design page',
    },
  ][c.n - 1]
  return { subject: r.subject, ...layout(c, { heading: r.heading, paragraphs: r.paragraphs, button: { label: r.button } }) }
}

/** Version Two onwards: one gentle reminder, two days after publishing. */
export function laterVersionReminder(c: Common & { versionTitle: string }): EmailContent {
  return {
    subject: `${c.versionTitle} is ready whenever you are, ${c.firstName}`,
    ...layout(c, {
      heading: `${c.versionTitle} is ready to see`,
      paragraphs: [
        `Just a gentle note that <strong>${esc(c.versionTitle)}</strong> of your design is ready, whenever suits you.`,
        `If you’d like to talk through any of the changes, ${esc(c.designer)} would be glad to help. Just send us a message.`,
      ],
      button: { label: `See ${c.versionTitle}` },
    }),
  }
}

export function sizeReminder(c: Common & { n: 1 | 2 | 3 }): EmailContent {
  const d = esc(c.designer)
  const hint = esc(around(c.ringSizeHint))
  const r = [
    {
      subject: `Your ring size, whenever you’re ready, ${c.firstName}`,
      heading: 'Just one small detail',
      paragraphs: [
        `We’re so excited that you love your design. The one thing ${d} needs before making your ring is your ring size${hint}.`,
        'Whenever you’re ready, you can add it on your page. If you’re not sure, send us a message and we’ll help you work it out.',
      ],
      button: 'Add my ring size',
    },
    {
      subject: 'A quick note about your ring size',
      heading: 'Just checking in',
      paragraphs: [
        `We hope you’re well! We wanted to check in about your ring size${hint}. There’s no rush at all.`,
        'If you’d like, we can talk you through a few easy ways to measure at home. Just send us a message.',
      ],
      button: 'Add my ring size',
    },
    {
      subject: `Here to help with your ring size, ${c.firstName}`,
      heading: 'We’re here to help',
      paragraphs: [
        'Finding the right size can be surprisingly tricky, so please take all the time you need.',
        `If a quick chat would make it easier, send us a message and we’ll find a time that suits you. Your design is safe with ${d} in the meantime.`,
      ],
      button: 'Visit your design page',
    },
  ][c.n - 1]
  return {
    subject: r.subject,
    ...layout(c, {
      heading: r.heading, paragraphs: r.paragraphs, skipRingLine: true,
      button: { label: r.button, href: r.button === 'Add my ring size' ? `${c.pageUrl}#ring-size` : undefined },
    }),
  }
}
