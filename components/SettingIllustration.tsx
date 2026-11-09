import type { SettingChoice } from '@/lib/setting'

// Placeholder line drawings for the setting question, shown until Ryan uploads
// the real images in Studio → Settings. Side view: finger, engagement ring and
// wedding band.
const GOLD = '#B8955E'
const GOLD_FILL = '#E9D8B4'
const STONE_FILL = '#FFFFFF'
const LINE = '#7A5A47'

export default function SettingIllustration({ choice, className }: { choice: SettingChoice; className?: string }) {
  const high = choice === 'high_set'
  return (
    <svg viewBox="0 0 320 220" className={className} role="img"
      aria-label={high ? 'Illustration: a high-set ring with a straight wedding band beside it' : 'Illustration: a low-set ring with a curved wedding band following its setting'}>
      <rect width="320" height="220" fill="#F1EAE0" />
      {/* finger */}
      <rect x="-20" y="138" width="360" height="56" rx="28" fill="#E4D2BF" />
      <rect x="-20" y="138" width="360" height="56" rx="28" fill="none" stroke="#D5C0A9" />

      {high ? (
        <g>
          {/* engagement ring band */}
          <rect x="126" y="128" width="16" height="72" rx="7" fill={GOLD_FILL} stroke={GOLD} strokeWidth="2" />
          {/* tall prongs lifting the stone */}
          <path d="M129 130 L120 62 M139 130 L148 62 M134 130 L134 66" stroke={GOLD} strokeWidth="3" strokeLinecap="round" fill="none" />
          {/* stone, held high */}
          <path d="M108 46 L160 46 L168 58 L134 98 L100 58 Z" fill={STONE_FILL} stroke={LINE} strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M100 58 L168 58 M118 46 L126 58 L134 98 M150 46 L142 58 L134 98" stroke={LINE} strokeWidth="0.9" fill="none" opacity=".6" />
          {/* straight wedding band right beside it, tucked under the stone */}
          <rect x="146" y="128" width="16" height="72" rx="7" fill={GOLD_FILL} stroke={GOLD} strokeWidth="2" />
          <text x="196" y="104" fontFamily="Georgia, serif" fontSize="13" fill={LINE}>straight band</text>
          <path d="M194 100 L166 128" stroke={LINE} strokeWidth="0.8" fill="none" />
        </g>
      ) : (
        <g>
          {/* engagement ring band */}
          <rect x="118" y="128" width="16" height="72" rx="7" fill={GOLD_FILL} stroke={GOLD} strokeWidth="2" />
          {/* low basket */}
          <path d="M104 112 L114 134 M148 112 L138 134 M108 120 L144 120" stroke={GOLD} strokeWidth="3" strokeLinecap="round" fill="none" />
          {/* stone, sitting low and close to the finger */}
          <path d="M100 90 L152 90 L160 102 L126 134 L92 102 Z" fill={STONE_FILL} stroke={LINE} strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M92 102 L160 102 M110 90 L118 102 L126 134 M142 90 L134 102 L126 134" stroke={LINE} strokeWidth="0.9" fill="none" opacity=".6" />
          {/* curved wedding band, following the setting */}
          <path d="M146 200 L146 146 C146 132 156 120 170 108" stroke={GOLD} strokeWidth="18" strokeLinecap="round" fill="none" />
          <path d="M146 200 L146 146 C146 132 156 120 170 108" stroke={GOLD_FILL} strokeWidth="14" strokeLinecap="round" fill="none" />
          <text x="200" y="80" fontFamily="Georgia, serif" fontSize="13" fill={LINE}>curved band</text>
          <path d="M198 76 L178 104" stroke={LINE} strokeWidth="0.8" fill="none" />
        </g>
      )}
      <text x="14" y="22" fontFamily="Georgia, serif" fontSize="9" fill="#8C7B6E" letterSpacing="2">ILLUSTRATION</text>
    </svg>
  )
}
