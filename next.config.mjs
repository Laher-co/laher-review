
const nextConfig = {
  experimental: {
    // Customer drawings are sent as JPEGs (one per request, well under this)
    serverActions: { bodySizeLimit: '4mb' },
    // HEIC conversion for emailed iPhone photos: loaded as-is, not bundled
    serverComponentsExternalPackages: ['heic-convert', 'libheif-js'],
  },
  images: {
    // Only our own Vercel Blob files are resized. (Previously any https host
    // was allowed, which let anyone use the optimiser for arbitrary images.)
    remotePatterns: [
      { protocol: 'https', hostname: '*.public.blob.vercel-storage.com' },
    ],
  },
}

export default nextConfig
