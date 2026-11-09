import { describe, expect, it } from 'vitest'
import { isSettingChoice, settingComment, settingState } from './setting'

describe('setting question', () => {
  it('can be answered any time and changed until Version One is published', () => {
    expect(settingState({ settingChoice: null, settingNotNeeded: false }, 0)).toBe('open')
    expect(settingState({ settingChoice: null, settingNotNeeded: false }, 2)).toBe('open')
    expect(settingState({ settingChoice: 'high_set', settingNotNeeded: false }, 0)).toBe('answered')
    expect(settingState({ settingChoice: 'high_set', settingNotNeeded: false }, 1)).toBe('locked')
  })
  it('is closed when staff mark it not needed', () => {
    expect(settingState({ settingChoice: null, settingNotNeeded: true }, 0)).toBe('not_needed')
    expect(settingState({ settingChoice: 'low_set', settingNotNeeded: true }, 0)).toBe('not_needed')
  })
  it('posts “SETTING: [answer]” on the card', () => {
    expect(settingComment('high_set', { changed: false })).toBe('**SETTING: HIGH SET – straight wedding band**')
    expect(settingComment('low_set', { changed: true, staffName: 'Heather' })).toBe('**SETTING (changed): LOW SET – curved wedding band** (set by Heather)')
  })
  it('only accepts the two answers', () => {
    expect(isSettingChoice('high_set')).toBe(true)
    expect(isSettingChoice('medium_set')).toBe(false)
  })
})
