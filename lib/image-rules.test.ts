import { describe, expect, it } from 'vitest'
import { checkImage, fitWithin, isHeic, isJobImageUrl, sniffImage } from './image-rules'

describe('checkImage', () => {
  it('accepts JPG, PNG, WebP and HEIC, by type or by name', () => {
    expect(checkImage({ name: 'a.jpg', type: 'image/jpeg', size: 1e6 })).toEqual({ kind: 'jpeg' })
    expect(checkImage({ name: 'a.png', type: 'image/png', size: 1e6 })).toEqual({ kind: 'png' })
    expect(checkImage({ name: 'a.webp', type: 'image/webp', size: 1e6 })).toEqual({ kind: 'webp' })
    expect(checkImage({ name: 'IMG_0001.HEIC', type: 'image/heic', size: 3e6 })).toEqual({ kind: 'heic' })
    expect(checkImage({ name: 'IMG_0001.HEIC', type: '', size: 3e6 })).toEqual({ kind: 'heic' })
  })
  it('explains the wrong type and too big', () => {
    expect(checkImage({ name: 'brief.pdf', type: 'application/pdf', size: 1e5 })).toEqual({
      error: '“brief.pdf” isn’t a photo we can use. Please choose a JPG, PNG, WebP or iPhone (HEIC) photo.' })
    expect(checkImage({ name: 'clip.mov', type: 'video/quicktime', size: 1e6 })).toHaveProperty('error')
    expect(checkImage({ name: 'huge.jpg', type: 'image/jpeg', size: 24 * 1024 * 1024 })).toEqual({
      error: '“huge.jpg” is too big (24 MB). Photos can be up to 20 MB.' })
    expect(checkImage({ name: 'ok.jpg', type: 'image/jpeg', size: 20 * 1024 * 1024 })).toEqual({ kind: 'jpeg' })
  })
})

describe('fitWithin', () => {
  it('shrinks the longest side to 2048 and never enlarges', () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 2048, height: 1536 })
    expect(fitWithin(3024, 4032)).toEqual({ width: 1536, height: 2048 })
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 })
  })
})

describe('file checks', () => {
  const bytes = (...b: (number | string)[]) => new Uint8Array(b.flatMap(x => typeof x === 'string' ? [...x].map(c => c.charCodeAt(0)) : [x]))
  it('recognises image bytes', () => {
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg')
    expect(sniffImage(bytes(0x89, 'PNG'))).toBe('image/png')
    expect(sniffImage(bytes('RIFF', 0, 0, 0, 0, 'WEBP'))).toBe('image/webp')
    expect(sniffImage(bytes('%PDF-1.7'))).toBeNull()
    expect(isHeic(bytes(0, 0, 0, 24, 'ftypheic'))).toBe(true)
    expect(isHeic(bytes(0, 0, 0, 24, 'ftypmp42'))).toBe(false)
  })
  it('only accepts this job’s uploads', () => {
    const base = 'https://abc.public.blob.vercel-storage.com/message-images'
    expect(isJobImageUrl(`${base}/job1/x.jpg`, 'job1')).toBe(true)
    expect(isJobImageUrl(`${base}/job2/x.jpg`, 'job1')).toBe(false)
    expect(isJobImageUrl('https://evil.example/message-images/job1/x.jpg', 'job1')).toBe(false)
    expect(isJobImageUrl('not a url', 'job1')).toBe(false)
  })
})
