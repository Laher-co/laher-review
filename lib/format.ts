const WORDS = [
  'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen',
  'Nineteen', 'Twenty',
]

/** "Version Two" — falls back to digits past twenty. */
export function versionTitle(n: number) {
  return `Version ${WORDS[n] ?? n}`
}

export function optionLabel(index: number) {
  return String.fromCharCode(65 + index) // 0 → "A"
}

export function formatSydney(d: Date | string, opts: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', ...opts,
  }).format(new Date(d))
}
