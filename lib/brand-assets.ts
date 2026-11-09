// The LAHER logo: at the top of every customer email and in the app header.
// Brown on a transparent background (1200 × 436).
export const LOGO = {
  // Emails need an absolute address that every mail app can load
  emailUrl: 'https://kvlfaeaodcgaipir.public.blob.vercel-storage.com/brand/laher-logo.png' as string | null,
  // The app serves its own copy (public/laher-logo.png)
  headerSrc: '/laher-logo.png' as string | null,
  alt: 'LAHER',
  emailWidth: 130,      // px, in emails
  headerHeight: 22,     // px, in the app header
}
