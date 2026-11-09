import { describe, expect, it } from 'vitest'
import {
  answerComment, cleanClusterStyles, clusterComment, firstNameOf, irregularClusterOn, mentionsIrregularCluster,
  newQuestionComment, notesComment, onboardingLinkComment, onboardingProgress, type OnboardingInput,
} from './onboarding'

const base: OnboardingInput = {
  ringSizeStatus: 'confirmed', ringSizeNotSureAt: null, sizeConfirmedByCustomer: false,
  settingQuestion: false, settingChoice: null, settingNotNeeded: false,
  clusterOn: false, clusterSavedAt: null, questions: [],
}

describe('onboarding progress', () => {
  it('counts only the sections that apply', () => {
    expect(onboardingProgress(base)).toMatchObject({ done: 0, total: 0 })
    expect(onboardingProgress({ ...base, ringSizeStatus: 'unconfirmed', settingQuestion: true })).toMatchObject({ done: 0, total: 2 })
  })
  it('ring size: done once confirmed or "Not sure yet"; still counted after the customer confirmed it', () => {
    expect(onboardingProgress({ ...base, ringSizeStatus: 'unconfirmed', ringSizeNotSureAt: new Date() })).toMatchObject({ done: 1, total: 1 })
    expect(onboardingProgress({ ...base, sizeConfirmedByCustomer: true })).toMatchObject({ done: 1, total: 1 })
  })
  it('setting, cluster and staff questions', () => {
    const p = onboardingProgress({
      ...base, settingQuestion: true, settingChoice: 'high_set', clusterOn: true, clusterSavedAt: null,
      questions: [{ answer: 'Yes' }, { answer: null }],
    })
    expect(p.sections).toEqual([{ key: 'setting', done: true }, { key: 'cluster', done: false }, { key: 'questions', done: false }])
    expect(p).toMatchObject({ done: 1, total: 3 })
  })
  it('a setting question marked not needed doesn’t count', () => {
    expect(onboardingProgress({ ...base, settingQuestion: true, settingNotNeeded: true }).total).toBe(0)
  })
})

describe('onboarding rules', () => {
  it('irregular cluster: from the description, staff can override', () => {
    expect(mentionsIrregularCluster('Style: IRREGULAR  Cluster with pear')).toBe(true)
    expect(mentionsIrregularCluster('cluster')).toBe(false)
    expect(irregularClusterOn({ irregularClusterAuto: true, irregularClusterOverride: null })).toBe(true)
    expect(irregularClusterOn({ irregularClusterAuto: true, irregularClusterOverride: false })).toBe(false)
    expect(irregularClusterOn({ irregularClusterAuto: false, irregularClusterOverride: true })).toBe(true)
  })
  it('cluster styles: only A–G, in order, no repeats', () => {
    expect(cleanClusterStyles(['G', 'A', 'Z', 'A'])).toEqual(['A', 'G'])
    expect(cleanClusterStyles('A')).toEqual([])
  })
  it('first name, never an email', () => {
    expect(firstNameOf('Liam Smith')).toBe('Liam')
    expect(firstNameOf('liam@example.com')).toBe('')
  })
  it('Trello comments', () => {
    expect(onboardingLinkComment('https://x/r/a/welcome')).toBe('Onboarding link: https://x/r/a/welcome')
    expect(newQuestionComment('u')).toBe('New question added – let the customer know there’s more to answer on their page: u')
    expect(clusterComment(['A', 'D'], false)).toBe('**IRREGULAR CLUSTER: A. Single Side Cluster, D. East-West Style**')
    expect(answerComment('Metal?', 'Yellow gold', true)).toBe('**CUSTOMER ANSWER (changed)**\nQ: Metal?\nA: Yellow gold')
    expect(notesComment('Love vintage', 2)).toBe('**NOTES FOR THE DESIGNER (from the customer)**\n\nLove vintage\n\n(2 inspiration photos: see LAHER Studio)')
  })
})
