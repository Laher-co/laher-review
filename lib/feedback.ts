// Shared by the customer page, staff page and server actions.

export const CHANGE_AREAS = [
  { key: 'band',    label: 'Band',          prompt: 'e.g. a thinner band, add a taper, change the profile' },
  { key: 'setting', label: 'Setting',       prompt: 'e.g. lower the setting, four claws instead of six' },
  { key: 'stone',   label: 'Centre stone',  prompt: 'e.g. a slightly larger oval, a different shape' },
  { key: 'metal',   label: 'Metal',         prompt: 'e.g. platinum instead of yellow gold' },
  { key: 'other',   label: 'Something else', prompt: 'Tell us what you’d like changed' },
] as const

export type ChangeArea = typeof CHANGE_AREAS[number]['key']
export const areaLabel = (k: string) => CHANGE_AREAS.find(a => a.key === k)?.label ?? k

/** Australian ring sizes F to Z+3, with halves. */
export const AU_RING_SIZES: string[] = (() => {
  const out: string[] = []
  for (let c = 'F'.charCodeAt(0); c <= 'Z'.charCodeAt(0); c++) {
    const l = String.fromCharCode(c)
    out.push(l, `${l} ½`)
  }
  out.push('Z+1', 'Z+2', 'Z+3')
  return out
})()

export const RING_SIZE_STATUS_LABEL = {
  unconfirmed: 'Unconfirmed',
  submitted:   'Submitted – awaiting confirmation',
  confirmed:   'Confirmed',
} as const
