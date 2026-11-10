import type { Eye, ProgressionStatus } from '../types/patient'

const STYLES: Record<ProgressionStatus, { label: string; cls: string }> = {
  baseline: { label: 'First visit', cls: 'bg-[#F7F5F1] text-[#5F5E5A] border-[#D3D1C7]' },
  stable: { label: 'Stable', cls: 'bg-[#E0F2FE] text-[#075985] border-[#BAE6FD]' },
  improved: { label: 'Improved', cls: 'bg-[#DCFCE7] text-[#166534] border-[#BBF7D0]' },
  progression: { label: 'Progression', cls: 'bg-[#FFF1F2] text-[#BE123C] border-[#FDA4AF]' },
}

export default function ProgressionBadge({
  status,
  worsenedEyes = [],
}: {
  status: ProgressionStatus
  worsenedEyes?: Eye[]
}) {
  const s = STYLES[status]
  const eyes = status === 'progression' && worsenedEyes.length > 0 ? ` (${worsenedEyes.join(', ')})` : ''
  return (
    <span
      title="Based on AI grades. A clinician should confirm."
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${s.cls}`}
    >
      {s.label}
      {eyes}
    </span>
  )
}