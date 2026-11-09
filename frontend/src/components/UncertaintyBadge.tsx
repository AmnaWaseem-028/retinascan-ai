import { UNCERTAINTY_CONFIGS, type UncertaintyTier } from '../types/triage'
export function UncertaintyBadge({ tier }: { tier: UncertaintyTier | null | undefined }) {
  if (!tier) return null
  const c = UNCERTAINTY_CONFIGS[tier]
  return (
    <span
      title={c.description}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${c.badgeBg} ${c.badgeText} ${c.badgeBorder}`}
    >
      <span className={`h-2 w-2 rounded-full ${c.dotColor}`} />
      {c.label}
    </span>
  )
}
export function ReviewFlagBadge({
  needsReview,
  reason,
}: {
  needsReview: boolean | null | undefined
  reason?: string | null
}) {
  if (!needsReview) return null
  return (
    <span
      title={reason ?? ''}
      className="inline-flex items-center gap-1.5 rounded-full border border-[#FCA5A5] bg-[#FEE2E2] px-2.5 py-1 text-xs font-medium text-[#991B1B]"
    >
      <span className="h-2 w-2 rounded-full bg-[#DC2626]" />
      Needs specialist review
    </span>
  )
}
