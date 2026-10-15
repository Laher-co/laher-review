
const nextConfig = {
  images: {
    // Only our own Vercel Blob files are resized. (Previously any https host
    // was allowed, which let anyone use the optimiser for arbitrary images.)
    remotePatterns: [
      { protocol: 'https', hostname: '*.public.blob.vercel-storage.com' },
    ],
  },
}

export default nextConfig
