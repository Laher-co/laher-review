'use client'

import Image from 'next/image'
import { useState } from 'react'
import Lightbox, { type LightboxImage } from './Lightbox'

/** A grid of thumbnails that open full-screen in the lightbox. */
export default function LightboxThumbs({ images, className = 'grid grid-cols-3 gap-2 sm:grid-cols-5', sizes = '(min-width: 640px) 200px, 33vw' }: {
  images: LightboxImage[]; className?: string; sizes?: string
}) {
  const [open, setOpen] = useState<number | null>(null)
  return (
    <>
      <div className={className}>
        {images.map((img, i) => (
          <button key={img.url} type="button" onClick={() => setOpen(i)} aria-label={`View ${img.alt || `image ${i + 1}`} full screen`}
            className="relative block aspect-square overflow-hidden rounded-lg border border-sand bg-linen transition-opacity hover:opacity-90">
            <Image src={img.url} alt={img.alt ?? ''} fill sizes={sizes} className="object-cover" />
          </button>
        ))}
      </div>
      {open !== null && <Lightbox images={images} start={open} onClose={() => setOpen(null)} />}
    </>
  )
}
