import { redirect } from 'next/navigation'
import { onboardingPath } from '@/lib/onboarding'

// The setting question is now a section of the onboarding page
export default function OldSettingLink({ params }: { params: { code: string } }) {
  redirect(`${onboardingPath(params.code)}#setting`)
}
