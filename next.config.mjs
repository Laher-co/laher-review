
const nextConfig = {
  experimental: {
    // Customer drawings are sent as JPEGs (one per request, well under this)
    serverActions: { bodySizeLimit: '4mb' },
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
