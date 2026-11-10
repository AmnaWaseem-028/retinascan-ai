import type { Eye } from '../types/patient'

export default function EyeBadge({
  eye,
  showName = false,
}: {
  eye: Eye | null | undefined
  showName?: boolean
}) {
  if (!eye) return null
  const isOD = eye === 'OD'
  const color = isOD
    ? 'bg-[#E0F2FE] text-[#0369A1] border-[#BAE6FD]'
    : 'bg-[#F3E8FF] text-[#7E22CE] border-[#E9D5FF]'
  return (
    <span
      title={isOD ? 'Right eye (OD)' : 'Left eye (OS)'}
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-bold tracking-wider ${color}`}
    >
      {eye}
      {showName && <span className="font-medium">({isOD ? 'right' : 'left'})</span>}
    </span>
  )
}