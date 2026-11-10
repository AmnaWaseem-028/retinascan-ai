import { GRADE_LABELS } from '../types/triage'
import { formatShortDate, type VisitSummary } from '../types/patient'

const W = 760
const H = 280
const PL = 150
const PR = 40
const PT = 24
const PB = 44
const plotW = W - PL - PR
const plotH = H - PT - PB
const yOf = (g: number) => PT + plotH - (g / 4) * plotH

type Pt = { x: number; y: number; grade: number; date: string }
const toPath = (pts: Pt[]) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')

export default function LongitudinalChart({ timeline }: { timeline: VisitSummary[] }) {
  if (timeline.length === 0) {
    return (
      <div className="h-40 flex items-center justify-center text-xs text-[#888780] bg-[#F7F5F1] rounded-xl border border-dashed border-[#D3D1C7]">
        No visits yet. Add a visit to start the timeline.
      </div>
    )
  }

  const xOf = (i: number) =>
    timeline.length === 1 ? PL + plotW / 2 : PL + (i / (timeline.length - 1)) * plotW

  const series = (eye: 'od' | 'os', dx: number): Pt[] =>
    timeline.flatMap((t, i) => {
      const g = t[eye]?.grade
      if (g === null || g === undefined) return []
      return [{ x: xOf(i) + dx, y: yOf(g), grade: g, date: t.visit.visit_date }]
    })

  const od = series('od', -4)
  const os = series('os', 4)

  return (
    <div className="bg-white rounded-2xl border border-[#D3D1C7] p-5 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-bold text-[#1B2421]">DR grade over time</h3>
          <p className="text-xs text-[#5F5E5A]">Latest graded scan of each eye, per visit</p>
        </div>
        <div className="flex items-center gap-4 text-xs font-semibold">
          <span className="flex items-center gap-1.5 text-[#0369A1]">
            <span className="w-3 h-3 rounded-full bg-[#0284C7] inline-block" /> OD (right)
          </span>
          <span className="flex items-center gap-1.5 text-[#7E22CE]">
            <span className="w-3 h-3 rounded-full bg-[#9333EA] inline-block" /> OS (left)
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto min-w-[620px]">
          {[0, 1, 2, 3, 4].map((g) => (
            <g key={g}>
              <line x1={PL} y1={yOf(g)} x2={W - PR} y2={yOf(g)} stroke="#E5E4E0" strokeDasharray={g === 0 ? undefined : '4 4'} />
              <text x={PL - 10} y={yOf(g) + 4} textAnchor="end" fontSize={11} fill="#5F5E5A">
                {`Grade ${g} · ${GRADE_LABELS[g]}`}
              </text>
            </g>
          ))}

          {timeline.map((t, i) => (
            <g key={t.visit.id}>
              <line x1={xOf(i)} y1={PT} x2={xOf(i)} y2={PT + plotH} stroke="#F1EFEA" />
              <text x={xOf(i)} y={H - 14} textAnchor="middle" fontSize={11} fill="#1B2421">
                {formatShortDate(t.visit.visit_date)}
              </text>
            </g>
          ))}

          {od.length > 1 && <path d={toPath(od)} fill="none" stroke="#0284C7" strokeWidth={2.5} strokeLinecap="round" />}
          {os.length > 1 && <path d={toPath(os)} fill="none" stroke="#9333EA" strokeWidth={2.5} strokeLinecap="round" />}

          {od.map((p, i) => (
            <circle key={`od-${i}`} cx={p.x} cy={p.y} r={5.5} fill="#0284C7" stroke="#fff" strokeWidth={2}>
              <title>{`OD: grade ${p.grade} on ${p.date}`}</title>
            </circle>
          ))}
          {os.map((p, i) => (
            <circle key={`os-${i}`} cx={p.x} cy={p.y} r={5.5} fill="#9333EA" stroke="#fff" strokeWidth={2}>
              <title>{`OS: grade ${p.grade} on ${p.date}`}</title>
            </circle>
          ))}
        </svg>
      </div>
    </div>
  )
}