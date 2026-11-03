import { describe, expect, it } from 'vitest'
import { gemstoneDetails, hasCaratTbc, isSourcingList, sourcingExit } from './stone'

describe('hasCaratTbc', () => {
  it('finds ct TBC in any form', () => {
    for (const t of ['(ct TBC)', '1.5 ct tbc', '13.84 x 7.56 x 4.79 mm, (ct tbc)', '1.2ct (TBC)', 'Oval sapphire, ct: TBC', 'CT TBC']) {
      expect(hasCaratTbc(t)).toBe(true)
    }
  })
  it('ignores sizes that are known, and other TBCs', () => {
    for (const t of ['1.5 ct', '2ct oval', 'Finger size TBC', 'ct 1.2, colour TBC later', 'tbc']) expect(hasCaratTbc(t)).toBe(false)
  })
})

describe('gemstoneDetails', () => {
  const desc = '**Name:**\nSam\n\n**Gemstones:**\nOval sapphire 8x6mm (ct TBC)\n\n**Finger Size:**\nM (tbc)'
  it('reads only the gemstone section', () => {
    expect(gemstoneDetails(desc)).toBe('**Gemstones:**\nOval sapphire 8x6mm (ct TBC)')
    expect(gemstoneDetails('**Gemstones/Diamonds;**\n1\\.5 ct tbc\n**Metal:**\nPlatinum')).toBe('**Gemstones/Diamonds;**\n1.5 ct tbc')
  })
  it('falls back to the whole description', () => {
    expect(gemstoneDetails('Oval 1.5 ct TBC, platinum')).toBe('Oval 1.5 ct TBC, platinum')
  })
  it('a finger size change leaves the gemstone details the same', () => {
    expect(gemstoneDetails(desc.replace('M (tbc)', 'N'))).toBe(gemstoneDetails(desc))
  })
})

describe('REQUIRES SOURCING', () => {
  it('recognises the list', () => {
    expect(isSourcingList('REQUIRES SOURCING')).toBe(true)
    expect(isSourcingList(' Requires Sourcing ')).toBe(true)
    expect(isSourcingList('DESIGN CONFIRMED | Requires Sourcing')).toBe(false)
  })
  it('works out what a move out means', () => {
    expect(sourcingExit('4.5 Heather | Print Ready', 'Heather')).toBe('print_ready')
    expect(sourcingExit('4.4 Heather | Alterations', 'heather')).toBe('alterations')
    expect(sourcingExit('Tara | Print Ready', 'Heather')).toHaveProperty('issue')
    expect(sourcingExit('4.3 Heather | Revision', 'Heather')).toHaveProperty('issue')
    expect(sourcingExit('2.2 Casting', 'Heather')).toHaveProperty('issue')
  })
})
