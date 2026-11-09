import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/useAuth'
import UrgencyBadge from '../components/UrgencyBadge'
import { type Screening, GRADE_LABELS, STATUS_CONFIGS, deriveUrgency } from '../types/triage'

function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [screenings, setScreenings] = useState<Screening[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let isCancelled = false

    const loadScreenings = async () => {
      if (!user) return

      const { data, error: queryError } = await supabase
        .from('screenings')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (!isCancelled) {
        if (queryError) {
          setError(queryError.message)
        } else {
          // Normalize missing urgency fields for existing records
          const normalized = (data || []).map((s: Screening) => {
            if (!s.urgency_tier) {
              const derived = deriveUrgency(s.grade, s.report_text)
              return {
                ...s,
                urgency_tier: derived.tier,
                urgency_level: derived.level,
                referral_timeframe: s.referral_timeframe || derived.timeframe,
                referral_action: s.referral_action || derived.action,
                triage_status: s.triage_status || 'pending_triage',
              }
            }
            return {
              ...s,
              triage_status: s.triage_status || 'pending_triage',
            }
          })
          setScreenings(normalized)
        }
        setLoading(false)
      }
    }

    loadScreenings()

    return () => {
      isCancelled = true
    }
  }, [user])

  const totalCount = screenings.length
  // Emergent = only Grade 4 (Proliferative DR). Quality rejects are counted separately.
  const emergentCount = screenings.filter((s) => s.urgency_tier === 'EMERGENT').length
  const recallCount = screenings.filter((s) => s.urgency_tier === 'QUALITY_RECALL').length
  const p2Count = screenings.filter((s) => s.urgency_level === 2).length
  const p3Count = screenings.filter((s) => s.urgency_level === 3).length
  const p4p5Count = screenings.filter((s) => s.urgency_level === 4 || s.urgency_level === 5).length
  const pendingTriageCount = screenings.filter((s) => !s.triage_status || s.triage_status === 'pending_triage').length

  const triageKpis = [
    {
      label: 'Emergent (P1)',
      value: emergentCount,
      icon: 'ti-alert-octagon',
      color: 'text-[#991B1B]',
      bg: 'bg-[#FEE2E2]',
      filter: 'P1',
      subtitle: '24–48h window',
    },
    {
      label: 'Urgent (P2)',
      value: p2Count,
      icon: 'ti-alert-triangle',
      color: 'text-[#9A3412]',
      bg: 'bg-[#FFEDD5]',
      filter: 'P2',
      subtitle: '2–4 wks window',
    },
    {
      label: 'Semi-Urgent (P3)',
      value: p3Count,
      icon: 'ti-clock-exclamation',
      color: 'text-[#854D0E]',
      bg: 'bg-[#FEF9C3]',
      filter: 'P3',
      subtitle: '2–3 mos window',
    },
    {
      label: 'Routine / Annual',
      value: p4p5Count,
      icon: 'ti-calendar-check',
      color: 'text-[#075985]',
      bg: 'bg-[#E0F2FE]',
      filter: 'P4_P5',
      subtitle: '6–12 mos / 12 mos',
    },
    {
      label: 'Recapture Needed',
      value: recallCount,
      icon: 'ti-camera-rotate',
      color: 'text-[#92400E]',
      bg: 'bg-[#FEF3C7]',
      filter: 'QUALITY_RECALL',
      subtitle: 'Image not gradable',
    },
  ]

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-[#0F3D3E]"></span>
            <span className="text-xs font-semibold uppercase tracking-wider text-[#0F3D3E]">
              OcuTriage Intelligence
            </span>
          </div>
          <h1 className="text-2xl font-bold text-[#1B2421]">Clinical Screening Dashboard</h1>
          <p className="text-[#5F5E5A] text-sm">
            Overview of retinal screenings categorized by clinical urgency and referral requirement.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/triage')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#0F3D3E] text-[#0F3D3E] bg-white text-sm font-medium hover:bg-[#0F3D3E] hover:text-white transition-colors shadow-xs"
          >
            <i className="ti ti-clipboard-heart"></i>
            Triage Worklist {pendingTriageCount > 0 && `(${pendingTriageCount})`}
          </button>
          <button
            onClick={() => navigate('/upload')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0F3D3E] text-white text-sm font-medium hover:bg-[#0C2F30] transition-colors shadow-sm"
          >
            <i className="ti ti-plus"></i>
            New screening
          </button>
        </div>
      </div>

      {/* KPI Urgency Tier Breakdown Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {triageKpis.map((stat) => (
          <div
            key={stat.label}
            onClick={() => navigate(`/triage?urgency=${stat.filter}`)}
            className="bg-white rounded-xl border border-[#D3D1C7] p-5 shadow-xs hover:border-[#0F3D3E] cursor-pointer transition-all hover:shadow-sm"
            title={`View ${stat.label} cases in Triage Worklist`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${stat.bg} ${stat.color}`}>
                  <i className={`ti ${stat.icon}`} style={{ fontSize: '16px' }}></i>
                </span>
                <p className="text-xs font-semibold text-[#5F5E5A]">{stat.label}</p>
              </div>
              <i className="ti ti-arrow-up-right text-xs text-[#888780]"></i>
            </div>
            <div className="flex items-baseline justify-between mt-3">
              <p className="text-2xl font-bold text-[#1B2421]">{stat.value}</p>
              <span className="text-[11px] font-medium text-[#888780]">{stat.subtitle}</span>
            </div>
          </div>
        ))}
      </div>

      {loading && (
        <div className="bg-white rounded-xl border border-[#D3D1C7] p-12 text-center shadow-xs">
          <div className="w-8 h-8 border-3 border-[#0F3D3E]/20 border-t-[#0F3D3E] rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-[#888780]">Loading clinical records...</p>
        </div>
      )}

      {error && !loading && (
        <p className="text-sm text-[#C1544C] bg-[#FAECE7] px-4 py-3 rounded-lg mb-6">{error}</p>
      )}

      {!loading && totalCount === 0 && (
        <div className="bg-white rounded-xl border border-[#D3D1C7] p-12 text-center shadow-xs">
          <i className="ti ti-photo-scan text-[#D3D1C7] block mx-auto mb-3" style={{ fontSize: '36px' }}></i>
          <p className="text-sm text-[#5F5E5A] mb-4">No screenings yet. Upload a fundus image to get started.</p>
          <button
            onClick={() => navigate('/upload')}
            className="px-4 py-2 rounded-lg bg-[#0F3D3E] text-white text-sm font-medium hover:bg-[#0C2F30] transition-colors"
          >
            Upload first scan
          </button>
        </div>
      )}

      {!loading && totalCount > 0 && (
        <div className="bg-white rounded-xl border border-[#D3D1C7] overflow-x-auto shadow-xs">
          <div className="px-5 py-4 border-b border-[#D3D1C7] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#1B2421]">Recent Screening History ({totalCount})</h2>
            <span className="text-xs text-[#5F5E5A]">Click any row for complete clinical breakdown</span>
          </div>
          <table className="w-full text-sm min-w-[750px]">
            <thead>
              <tr className="border-b border-[#D3D1C7] text-left bg-[#F7F5F1] text-xs uppercase tracking-wider text-[#5F5E5A]">
                <th className="px-5 py-3 font-semibold whitespace-nowrap">Date & Time</th>
                <th className="px-5 py-3 font-semibold whitespace-nowrap">DR Severity</th>
                <th className="px-5 py-3 font-semibold whitespace-nowrap">AI Confidence</th>
                <th className="px-5 py-3 font-semibold whitespace-nowrap">Triage Urgency</th>
                <th className="px-5 py-3 font-semibold whitespace-nowrap">Status</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D3D1C7]/60 text-xs">
              {screenings.map((s) => {
                const status = s.triage_status || 'pending_triage'
                const statusCfg = STATUS_CONFIGS[status] || STATUS_CONFIGS.pending_triage

                return (
                  <tr
                    key={s.id}
                    onClick={() => navigate(`/result/${s.id}`)}
                    className="hover:bg-[#F9F8F5] cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-3.5 text-[#1B2421] whitespace-nowrap font-medium">
                      {new Date(s.created_at).toLocaleDateString()} &middot;{' '}
                      <span className="text-[#888780] font-normal">
                        {new Date(s.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      {s.grade !== null ? (
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-[#E1F5EE] text-[#04342C] whitespace-nowrap">
                          {GRADE_LABELS[s.grade] ?? s.grade}
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-[#FEF3C7] text-[#92400E] whitespace-nowrap">
                          Quality Recall
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-[#1B2421] whitespace-nowrap font-medium">
                      {s.confidence !== null ? `${Math.round(s.confidence * 100)}%` : '—'}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <UrgencyBadge tier={s.urgency_tier} priority={s.urgency_level} size="sm" />
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium ${statusCfg.badgeBg} ${statusCfg.badgeText}`}
                      >
                        <i className={`ti ${statusCfg.icon}`}></i>
                        {statusCfg.label}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right text-[#888780] whitespace-nowrap">
                      <i className="ti ti-chevron-right text-sm"></i>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default Dashboard