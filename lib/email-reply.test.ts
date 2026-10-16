import { describe, expect, it } from 'vitest'
import { htmlToText, isAutoReply, newReplyToken, replyAddress, stripQuotedReply, tokenFromAddress } from './email-reply'

describe('reply addresses', () => {
  it('round-trips a token', () => {
    const t = newReplyToken()
    expect(tokenFromAddress(replyAddress(t))).toBe(t)
    expect(tokenFromAddress(`LAHER Studio <${replyAddress(t).toUpperCase()}>`)).toBe(t)
  })
  it('ignores other addresses', () => {
    expect(tokenFromAddress('hello@leiedesign.com')).toBeNull()
    expect(tokenFromAddress('jabc@reply.example.com')).toBeNull()
  })
})

describe('stripQuotedReply', () => {
  it('drops the Gmail quote', () => {
    expect(stripQuotedReply('Love it! Can we go slightly thinner?\n\nOn Fri, 16 Oct 2026 at 10:00, LAHER <studio@laher.co> wrote:\n> Your design is ready')).toBe('Love it! Can we go slightly thinner?')
  })
  it('drops a quote header split over two lines', () => {
    expect(stripQuotedReply('Yes please\n\nOn Fri, 16 Oct 2026 at 10:00 am, LAHER\n<studio@laher.co> wrote:\n> hi')).toBe('Yes please')
  })
  it('drops Outlook’s original message block', () => {
    expect(stripQuotedReply('Thanks Heather\n\n________________________________\nFrom: LAHER <studio@laher.co>\nSent: Friday\nTo: Liam\nSubject: Your design')).toBe('Thanks Heather')
    expect(stripQuotedReply('Sounds good\n-----Original Message-----\nFrom: x')).toBe('Sounds good')
  })
  it('drops signatures', () => {
    expect(stripQuotedReply('Perfect, thank you!\n\nSent from my iPhone')).toBe('Perfect, thank you!')
    expect(stripQuotedReply('Great\n-- \nLiam Kilpatrick\n0400 000 000')).toBe('Great')
    expect(stripQuotedReply('Ok\n\nGet Outlook for iOS')).toBe('Ok')
  })
  it('keeps a normal multi-paragraph message', () => {
    expect(stripQuotedReply('Hi Heather,\n\nCould we try platinum?\n\nThanks,\nLiam')).toBe('Hi Heather,\n\nCould we try platinum?\n\nThanks,\nLiam')
  })
})

describe('htmlToText', () => {
  it('keeps the reply and drops the quoted block', () => {
    const html = '<div dir="ltr">Looks <b>great</b>!<br>Thanks</div><div class="gmail_quote"><blockquote>old</blockquote></div>'
    expect(stripQuotedReply(htmlToText(html))).toBe('Looks great!\nThanks')
  })
})

describe('isAutoReply', () => {
  it('spots out-of-office replies', () => {
    expect(isAutoReply('Automatic reply: Your design is ready')).toBe(true)
    expect(isAutoReply('Out of Office until Monday')).toBe(true)
    expect(isAutoReply('Re: Your design', { 'Auto-Submitted': 'auto-replied' })).toBe(true)
    expect(isAutoReply('Re: Your design is ready')).toBe(false)
  })
})
