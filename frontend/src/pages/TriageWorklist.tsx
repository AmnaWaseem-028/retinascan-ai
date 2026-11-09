import { useEffect, useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/useAuth'
import UrgencyBadge from '../components/UrgencyBadge'
import { UncertaintyBadge, ReviewFlagBadge } from '../components/UncertaintyBadge'
import {
  type Screening,
  type UrgencyTier,
  type TriageStatus,
  URGENCY_CONFIGS,
  STATUS_CONFIGS,
  GRADE_LABELS,
  deriveUrgency,
} from '../types/triage'

export default function TriageWorklist() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuth()

  const [screenings, setScreenings] = useState<Screening[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  // Filters & Search
  const selectedUrgency = searchParams.get('urgency') || 'ALL'
  const setSelectedUrgency = (val: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (val === 'ALL') {
        next.delete('urgency')
      } else {
        next.set('urgency', val)
      }
      return next
    })
  }
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL')
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState<'priority' | 'date_desc' | 'date_asc'>('priority')
  // Feature 2: show only cases flagged for specialist review
  const [reviewOnly, setReviewOnly] = useState(false)

  // Clinician Note Modal State
  const [activeNoteModal, setActiveNoteModal] = useState<{
    id: string
    currentNote: string
    status: TriageStatus
  } | null>(null)
  const [modalNoteText, setModalNoteText] = useState('')
  const [modalSaving, setModalSaving] = useState(false)

  // Load screenings on mount
  useEffect(() => {
    let isCancelled = false

    const fetchWorklist = async () => {
      try {
        const { data, error: fetchErr } = await supabase
          .from('screenings')
          .select('*')
          .order('urgency_level', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: false })

        if (isCancelled) return

        if (fetchErr) throw fetchErr

        // Normalize missing urgency fields for backward compatibility
        const normalized = (data || []).map((s: Screening) => {
          if (!s.urgency_tier) {
            const derived = deriveUrgency(s.grade, s.report_text)
            return {
              ...s,
              urgency_tier: derived.tier,
              urgency_level: derived.level,
              referral_timeframe: s.referral_timeframe || derived.timeframe,
              referral_action: s.referral_action || derived.action,
              triage_status: (s.triage_status as TriageStatus) || 'pending_triage',
            }
          }
          return {
            ...s,
            triage_status: (s.triage_status as TriageStatus) || 'pending_triage',
          }
        })

        setScreenings(normalized)
      } catch (err: unknown) {
        if (!isCancelled) {
          const msg = err instanceof Error ? err.message : 'Failed to load triage worklist'
          setError(msg)
        }
      } finally {
        if (!isCancelled) {
          setLoading(false)
        }
      }
    }

    fetchWorklist()

    return () => {
      isCancelled = true
    }
  }, [])

  // Handle status update
  const handleStatusChange = async (screeningId: string, newStatus: TriageStatus, note?: string) => {
    setUpdatingId(screeningId)
    setActionMessage('')
    setError('')
    try {
      let saved = false

      // 1) Try backend PATCH API first
      try {
        const response = await fetch(`http://127.0.0.1:8000/api/screenings/${screeningId}/triage`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            triage_status: newStatus,
            triage_notes: note,
            triaged_by: user?.id,
          }),
        })
        if (response.ok) {
          saved = true
        } else {
          console.error('Backend triage update failed:', response.status, await response.text())
        }
      } catch (netErr) {
        console.error('Backend unreachable:', netErr)
      }

      // 2) Fallback: direct Supabase update (and verify it really saved)
      if (!saved) {
        const { data, error: directErr } = await supabase
          .from('screenings')
          .update({
            triage_status: newStatus,
            triage_notes: note,
            triaged_at: new Date().toISOString(),
            triaged_by: user?.id,
          })
          .eq('id', screeningId)
          .select('id')

        if (directErr) throw directErr
        if (!data || data.length === 0) {
          throw new Error(
            'Status was NOT saved. Backend is not reachable and the database blocked the update. Start the backend and try again.'
          )
        }
      }

      // Update state locally
      setScreenings((prev) =>
        prev.map((item) =>
          item.id === screeningId
            ? {
                ...item,
                triage_status: newStatus,
                triage_notes: note !== undefined ? note : item.triage_notes,
                triaged_at: new Date().toISOString(),
                triaged_by: user?.id || null,
              }
            : item
        )
      )

      setActionMessage(`Case #${screeningId.slice(0, 8)} status updated to ${STATUS_CONFIGS[newStatus]?.label || newStatus}`)
      setTimeout(() => setActionMessage(''), 3500)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error updating status'
      setError(msg)
    } finally {
      setUpdatingId(null)
    }
  }

  // Save note modal
  const handleSaveModalNote = async () => {
    if (!activeNoteModal) return
    setModalSaving(true)
    await handleStatusChange(activeNoteModal.id, activeNoteModal.status, modalNoteText)
    setModalSaving(false)
    setActiveNoteModal(null)
  }

  // Filtered & Sorted Worklist
  const filteredWorklist = useMemo(() => {
    return screenings
      .filter((s) => {
        // Urgency filter
        if (selectedUrgency !== 'ALL') {
          // P1 = Emergent only (Grade 4). Quality rejects have their own filter.
          if (selectedUrgency === 'P1' && s.urgency_tier !== 'EMERGENT') return false
          if (selectedUrgency === 'P2' && s.urgency_level !== 2) return false
          if (selectedUrgency === 'P3' && s.urgency_level !== 3) return false
          if (selectedUrgency === 'P4_P5' && s.urgency_level !== 4 && s.urgency_level !== 5) return false
          if (
            ['EMERGENT', 'QUALITY_RECALL', 'URGENT', 'SEMI_URGENT', 'ROUTINE', 'ANNUAL_MONITORING'].includes(
              selectedUrgency
            ) &&
            s.urgency_tier !== selectedUrgency
          ) {
            return false
          }
        }

        // Status filter
        if (selectedStatus !== 'ALL' && s.triage_status !== selectedStatus) {
          return false
        }

        // Feature 2: needs specialist review filter
        if (reviewOnly && !s.needs_review) {
          return false
        }

        // Search term (ID or Report Text or Date)
        if (searchTerm.trim()) {
          const term = searchTerm.toLowerCase()
          const matchId = s.id.toLowerCase().includes(term)
          const matchDate = new Date(s.created_at).toLocaleDateString().toLowerCase().includes(term)
          const matchAction = s.referral_action?.toLowerCase().includes(term) || false
          if (!matchId && !matchDate && !matchAction) return false
        }

        return true
      })
      .sort((a, b) => {
        if (sortBy === 'priority') {
          const pA = a.urgency_level ?? 99
          const pB = b.urgency_level ?? 99
          if (pA !== pB) return pA - pB
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        }
        if (sortBy === 'date_desc') {
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        }
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      })
  }, [screenings, selectedUrgency, selectedStatus, searchTerm, sortBy, reviewOnly])

  // Summary Metrics
  const p1Count = screenings.filter((s) => s.urgency_tier === 'EMERGENT').length
  const recallCount = screenings.filter((s) => s.urgency_tier === 'QUALITY_RECALL').length
  const p2Count = screenings.filter((s) => s.urgency_level === 2).length
  const p3Count = screenings.filter((s) => s.urgency_level === 3).length
  const p4p5Count = screenings.filter((s) => s.urgency_level === 4 || s.urgency_level === 5).length
  const pendingCount = screenings.filter((s) => !s.triage_status || s.triage_status === 'pending_triage').length
  const reviewCount = screenings.filter((s) => s.needs_review).length

  // Export to CSV (UTF-8 with BOM so Excel shows en-dashes and symbols correctly)
  const handleExportCSV = () => {
    const headers = [
      'Screening ID',
      'Date',
      'Urgency Tier',
      'Priority Level',
      'Timeframe',
      'Grade',
      'Confidence',
      'Uncertainty',
      'Needs Specialist Review',
      'Triage Status',
      'Clinician Notes',
      'Recommended Action',
    ]
    const rows = filteredWorklist.map((s) => [
      `"${s.id}"`,
      `"${new Date(s.created_at).toLocaleString()}"`,
      `"${s.urgency_tier || 'N/A'}"`,
      `"P${s.urgency_level || 'N/A'}"`,
      `"${s.referral_timeframe || 'N/A'}"`,
      `"${s.grade !== null ? GRADE_LABELS[s.grade] : 'Quality Reject'}"`,
      `"${s.confidence ? Math.round(s.confidence * 100) + '%' : 'N/A'}"`,
      `"${s.uncertainty_tier || 'N/A'}"`,
      `"${s.needs_review ? 'Yes' : 'No'}"`,
      `"${STATUS_CONFIGS[s.triage_status || 'pending_triage']?.label || s.triage_status}"`,
      `"${(s.triage_notes || '').replace(/"/g, '""')}"`,
      `"${(s.referral_action || '').replace(/"/g, '""')}"`,
    ])

    const csvText = [headers.join(','), ...rows.map((e) => e.join(','))].join('\r\n')
    const blob = new Blob(['\uFEFF' + csvText], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `ocutriage-worklist-${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#0F3D3E]"></span>
            <span className="text-xs font-semibold uppercase tracking-wider text-[#0F3D3E]">Clinical Triage Queue</span>
          </div>
          <h1 className="text-2xl font-bold text-[#1B2421] mt-0.5">Referral Urgency & Triage Worklist</h1>
          <p className="text-[#5F5E5A] text-sm mt-0.5">
            Patients prioritized algorithmically by diabetic retinopathy severity and visual loss risk.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-[#D3D1C7] bg-white text-sm font-medium text-[#1B2421] hover:bg-[#F7F5F1] transition-colors shadow-xs"
          >
            <i className="ti ti-download text-[#5F5E5A]"></i>
            Export CSV
          </button>
          <button
            onClick={() => navigate('/upload')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0F3D3E] text-white text-sm font-medium hover:bg-[#0C2F30] transition-colors shadow-sm"
          >
            <i className="ti ti-plus"></i>
            New Screening
          </button>
        </div>
      </div>

      {/* Action Notification Banner */}
      {actionMessage && (
        <div className="mb-6 flex items-center justify-between bg-[#E1F5EE] border border-[#9FC9C4] text-[#04342C] px-4 py-3 rounded-xl shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <i className="ti ti-check text-lg"></i>
            <span className="text-sm font-medium">{actionMessage}</span>
          </div>
          <button onClick={() => setActionMessage('')} className="text-[#04342C]/60 hover:text-[#04342C]">
            <i className="ti ti-x"></i>
          </button>
        </div>
      )}

      {error && (
        <div className="mb-6 bg-[#FAECE7] border border-[#FCA5A5] text-[#C1544C] px-4 py-3 rounded-xl text-sm flex items-center gap-2">
          <i className="ti ti-alert-triangle text-lg"></i>
          <span>{error}</span>
        </div>
      )}

      {/* KPI Urgency Tier Breakdown Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3.5 mb-6">
        {/* P1 Card (Emergent = Grade 4 only) */}
        <div
          onClick={() => setSelectedUrgency(selectedUrgency === 'P1' ? 'ALL' : 'P1')}
          className={`cursor-pointer rounded-xl border p-4 transition-all duration-150 ${
            selectedUrgency === 'P1'
              ? 'ring-2 ring-[#DC2626] bg-[#FEF2F2] border-[#FCA5A5]'
              : 'bg-white border-[#D3D1C7] hover:border-[#DC2626]/50'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#991B1B] flex items-center gap-1.5">
              {p1Count > 0 && <span className="w-2 h-2 rounded-full bg-[#DC2626] animate-ping" />}
              Emergent (P1)
            </span>
            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-[#FEE2E2] text-[#991B1B]">
              24–48h
            </span>
          </div>
          <p className="text-2xl font-bold text-[#1B2421]">{p1Count}</p>
          <p className="text-[11px] text-[#5F5E5A] mt-1">Proliferative DR (Grade 4)</p>
        </div>

        {/* P2 Card */}
        <div
          onClick={() => setSelectedUrgency(selectedUrgency === 'P2' ? 'ALL' : 'P2')}
          className={`cursor-pointer rounded-xl border p-4 transition-all duration-150 ${
            selectedUrgency === 'P2'
              ? 'ring-2 ring-[#EA580C] bg-[#FFF7ED] border-[#FDBA74]'
              : 'bg-white border-[#D3D1C7] hover:border-[#EA580C]/50'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#9A3412]">Urgent (P2)</span>
            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-[#FFEDD5] text-[#9A3412]">
              2–4 wks
            </span>
          </div>
          <p className="text-2xl font-bold text-[#1B2421]">{p2Count}</p>
          <p className="text-[11px] text-[#5F5E5A] mt-1">Severe Non-Proliferative DR</p>
        </div>

        {/* P3 Card */}
        <div
          onClick={() => setSelectedUrgency(selectedUrgency === 'P3' ? 'ALL' : 'P3')}
          className={`cursor-pointer rounded-xl border p-4 transition-all duration-150 ${
            selectedUrgency === 'P3'
              ? 'ring-2 ring-[#CA8A04] bg-[#FEFCE8] border-[#FDE047]'
              : 'bg-white border-[#D3D1C7] hover:border-[#CA8A04]/50'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#854D0E]">Semi-Urgent (P3)</span>
            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-[#FEF9C3] text-[#854D0E]">
              2–3 mos
            </span>
          </div>
          <p className="text-2xl font-bold text-[#1B2421]">{p3Count}</p>
          <p className="text-[11px] text-[#5F5E5A] mt-1">Moderate Non-Proliferative DR</p>
        </div>

        {/* P4 & P5 Card */}
        <div
          onClick={() => setSelectedUrgency(selectedUrgency === 'P4_P5' ? 'ALL' : 'P4_P5')}
          className={`cursor-pointer rounded-xl border p-4 transition-all duration-150 ${
            selectedUrgency === 'P4_P5'
              ? 'ring-2 ring-[#0284C7] bg-[#F0F9FF] border-[#BAE6FD]'
              : 'bg-white border-[#D3D1C7] hover:border-[#0284C7]/50'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#075985]">Routine / Annual</span>
            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-[#E0F2FE] text-[#075985]">
              6–12 mos
            </span>
          </div>
          <p className="text-2xl font-bold text-[#1B2421]">{p4p5Count}</p>
          <p className="text-[11px] text-[#5F5E5A] mt-1">Mild DR (P4) & No DR (P5)</p>
        </div>

        {/* Quality Recall Card */}
        <div
          onClick={() => setSelectedUrgency(selectedUrgency === 'QUALITY_RECALL' ? 'ALL' : 'QUALITY_RECALL')}
          className={`cursor-pointer rounded-xl border p-4 transition-all duration-150 ${
            selectedUrgency === 'QUALITY_RECALL'
              ? 'ring-2 ring-[#D97706] bg-[#FFFBEB] border-[#FCD34D]'
              : 'bg-white border-[#D3D1C7] hover:border-[#D97706]/50'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#92400E]">Recapture Needed</span>
            <i className="ti ti-camera-rotate text-[#92400E]"></i>
          </div>
          <p className="text-2xl font-bold text-[#1B2421]">{recallCount}</p>
          <p className="text-[11px] text-[#5F5E5A] mt-1">Image quality failed, not graded</p>
        </div>

        {/* Pending Triage Action Card */}
        <div
          onClick={() => setSelectedStatus(selectedStatus === 'pending_triage' ? 'ALL' : 'pending_triage')}
          className={`cursor-pointer rounded-xl border p-4 transition-all duration-150 col-span-2 lg:col-span-1 ${
            selectedStatus === 'pending_triage'
              ? 'ring-2 ring-[#0F3D3E] bg-[#E1F5EE] border-[#0F3D3E]'
              : 'bg-white border-[#D3D1C7] hover:border-[#0F3D3E]/50'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#0F3D3E]">Action Pending</span>
            <i className="ti ti-clock text-[#0F3D3E]"></i>
          </div>
          <p className="text-2xl font-bold text-[#1B2421]">{pendingCount}</p>
          <p className="text-[11px] text-[#5F5E5A] mt-1">Awaiting clinician sign-off</p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white rounded-xl border border-[#D3D1C7] p-4 mb-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Urgency Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'ALL', label: 'All Cases' },
            { id: 'P1', label: 'Priority 1 (Emergent)' },
            { id: 'P2', label: 'Priority 2 (Urgent)' },
            { id: 'P3', label: 'Priority 3 (Semi-Urgent)' },
            { id: 'P4_P5', label: 'P4/P5 (Routine/Annual)' },
            { id: 'QUALITY_RECALL', label: 'Recalls' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedUrgency(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedUrgency === tab.id
                  ? 'bg-[#0F3D3E] text-white shadow-xs'
                  : 'bg-[#F7F5F1] text-[#5F5E5A] hover:bg-[#E8E6DF] hover:text-[#1B2421]'
              }`}
            >
              {tab.label}
            </button>
          ))}

          {/* Feature 2: Needs specialist review filter */}
          <button
            onClick={() => setReviewOnly((v) => !v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1.5 ${
              reviewOnly
                ? 'bg-[#991B1B] text-white shadow-xs'
                : 'bg-[#FEE2E2] text-[#991B1B] hover:bg-[#FECACA]'
            }`}
          >
            <i className="ti ti-alert-triangle"></i>
            Needs Review ({reviewCount})
          </button>
        </div>

        {/* Controls: Search, Status, Sort */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Status Dropdown */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-[#D3D1C7] text-xs font-medium text-[#1B2421] bg-white focus:outline-none focus:border-[#0F3D3E]"
          >
            <option value="ALL">All Statuses</option>
            <option value="pending_triage">Pending Triage</option>
            <option value="in_review">In Review</option>
            <option value="referred">Referred</option>
            <option value="completed">Completed</option>
          </select>

          {/* Sort By Dropdown */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'priority' | 'date_desc' | 'date_asc')}
            className="px-3 py-1.5 rounded-lg border border-[#D3D1C7] text-xs font-medium text-[#1B2421] bg-white focus:outline-none focus:border-[#0F3D3E]"
          >
            <option value="priority">Sort: Highest Urgency (P1 → P5)</option>
            <option value="date_desc">Sort: Most Recent Date</option>
            <option value="date_asc">Sort: Oldest in Queue</option>
          </select>

          {/* Search Box */}
          <div className="relative">
            <i className="ti ti-search absolute left-2.5 top-1/2 -translate-y-1/2 text-[#888780] text-xs"></i>
            <input
              type="text"
              placeholder="Search ID, action..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-7 pr-3 py-1.5 text-xs rounded-lg border border-[#D3D1C7] bg-white focus:outline-none focus:border-[#0F3D3E] w-48"
            />
          </div>
        </div>
      </div>

      {/* Main Worklist Table */}
      {loading ? (
        <div className="bg-white rounded-xl border border-[#D3D1C7] p-16 text-center shadow-xs">
          <div className="w-8 h-8 border-3 border-[#0F3D3E]/20 border-t-[#0F3D3E] rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-[#5F5E5A]">Organizing prioritized clinical worklist...</p>
        </div>
      ) : filteredWorklist.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#D3D1C7] p-16 text-center shadow-xs">
          <i className="ti ti-clipboard-check text-[#D3D1C7] block mx-auto mb-3" style={{ fontSize: '42px' }}></i>
          <h3 className="text-base font-semibold text-[#1B2421] mb-1">No matching triage records</h3>
          <p className="text-sm text-[#5F5E5A] mb-4">
            Try adjusting your urgency filters or upload a new fundus screening.
          </p>
          <button
            onClick={() => {
              setSelectedUrgency('ALL')
              setSelectedStatus('ALL')
              setSearchTerm('')
              setReviewOnly(false)
            }}
            className="px-4 py-2 rounded-lg border border-[#D3D1C7] text-xs font-medium text-[#1B2421] hover:bg-[#F7F5F1]"
          >
            Reset All Filters
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#D3D1C7] overflow-x-auto shadow-xs">
          <table className="w-full text-sm text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="border-b border-[#D3D1C7] bg-[#F7F5F1] text-[12px] font-semibold text-[#5F5E5A] uppercase tracking-wider">
                <th className="px-4 py-3.5 whitespace-nowrap">Urgency Tier & Priority</th>
                <th className="px-4 py-3.5 whitespace-nowrap">Screening / Date</th>
                <th className="px-4 py-3.5 whitespace-nowrap">AI DR Grade & Uncertainty</th>
                <th className="px-4 py-3.5 whitespace-nowrap">Recommended Action & Window</th>
                <th className="px-4 py-3.5 whitespace-nowrap">Triage Status</th>
                <th className="px-4 py-3.5 whitespace-nowrap">Notes</th>
                <th className="px-4 py-3.5 text-right whitespace-nowrap">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D3D1C7]/70 text-xs">
              {filteredWorklist.map((s) => {
                const tier = (s.urgency_tier as UrgencyTier) || 'ROUTINE'
                const config = URGENCY_CONFIGS[tier] || URGENCY_CONFIGS.ROUTINE
                const status = (s.triage_status as TriageStatus) || 'pending_triage'
                const statusConfig = STATUS_CONFIGS[status] || STATUS_CONFIGS.pending_triage
                const isP1 = s.urgency_level === 1

                return (
                  <tr
                    key={s.id}
                    className={`transition-colors hover:bg-[#F9F8F5] ${
                      isP1 ? 'bg-[#FFFBFB]' : ''
                    }`}
                  >
                    {/* Urgency Badge */}
                    <td className="px-4 py-3.5 whitespace-nowrap align-middle">
                      <UrgencyBadge
                        tier={s.urgency_tier}
                        priority={s.urgency_level}
                        size="md"
                      />
                    </td>

                    {/* ID & Date */}
                    <td className="px-4 py-3.5 align-middle">
                      <div className="flex flex-col">
                        <span
                          onClick={() => navigate(`/result/${s.id}`)}
                          className="font-mono text-[11px] font-bold text-[#0F3D3E] hover:underline cursor-pointer"
                          title="View clinical result"
                        >
                          #{s.id.slice(0, 8)}...
                        </span>
                        <span className="text-[11px] text-[#5F5E5A] mt-0.5">
                          {new Date(s.created_at).toLocaleDateString()} &middot;{' '}
                          {new Date(s.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </td>

                    {/* Grade, Confidence & Uncertainty */}
                    <td className="px-4 py-3.5 align-middle">
                      {s.grade !== null ? (
                        <div className="flex flex-col items-start gap-1.5">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-[#1B2421]">
                              {GRADE_LABELS[s.grade]}
                            </span>
                            <span className="text-[11px] text-[#5F5E5A]">
                              ({s.confidence ? `${Math.round(s.confidence * 100)}%` : '—'})
                            </span>
                          </div>
                          {(s.uncertainty_tier || s.needs_review) && (
                            <div className="flex flex-col items-start gap-1">
                              <UncertaintyBadge tier={s.uncertainty_tier} />
                              <ReviewFlagBadge needsReview={s.needs_review} reason={s.review_reason} />
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#92400E] bg-[#FEF3C7] px-2 py-0.5 rounded">
                          <i className="ti ti-alert-circle"></i> Quality Reject
                        </span>
                      )}
                    </td>

                    {/* Referral Action & Timeframe */}
                    <td className="px-4 py-3.5 max-w-xs align-middle">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="font-semibold text-[11px] text-[#0F3D3E]">
                          <i className="ti ti-alarm text-xs mr-0.5"></i>
                          {s.referral_timeframe || config.timeframe}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#5F5E5A] line-clamp-2 leading-relaxed" title={s.referral_action || config.action}>
                        {s.referral_action || config.action}
                      </p>
                    </td>

                    {/* Interactive Triage Status Selector */}
                    <td className="px-4 py-3.5 align-middle">
                      <div className="relative inline-block">
                        <select
                          disabled={updatingId === s.id}
                          value={status}
                          onChange={(e) =>
                            handleStatusChange(s.id, e.target.value as TriageStatus, s.triage_notes || undefined)
                          }
                          className={`appearance-none text-[11px] font-semibold pl-2.5 pr-6 py-1 rounded-full border cursor-pointer focus:outline-none transition-all shadow-2xs ${statusConfig.badgeBg} ${statusConfig.badgeText} border-black/10 hover:border-black/25 disabled:opacity-50`}
                        >
                          <option value="pending_triage">⏳ Pending Triage</option>
                          <option value="in_review">🔍 In Review</option>
                          <option value="referred">↗ Referred</option>
                          <option value="completed">✓ Completed</option>
                        </select>
                        <i className="ti ti-chevron-down absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[10px] opacity-60"></i>
                      </div>

                      {s.triaged_at && (
                        <p className="text-[10px] text-[#888780] mt-0.5">
                          {new Date(s.triaged_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </p>
                      )}
                    </td>

                    {/* Clinician Notes */}
                    <td className="px-4 py-3.5 align-middle">
                      {s.triage_notes ? (
                        <button
                          onClick={() => {
                            setActiveNoteModal({
                              id: s.id,
                              currentNote: s.triage_notes || '',
                              status: (s.triage_status as TriageStatus) || 'pending_triage',
                            })
                            setModalNoteText(s.triage_notes || '')
                          }}
                          className="text-left text-[11px] text-[#1B2421] max-w-[140px] truncate block hover:text-[#0F3D3E] underline decoration-dotted"
                          title={s.triage_notes}
                        >
                          {s.triage_notes}
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setActiveNoteModal({
                              id: s.id,
                              currentNote: '',
                              status: (s.triage_status as TriageStatus) || 'pending_triage',
                            })
                            setModalNoteText('')
                          }}
                          className="text-[11px] text-[#5F5E5A] hover:text-[#0F3D3E] inline-flex items-center gap-1 font-medium"
                        >
                          <i className="ti ti-plus text-[10px]"></i> Note
                        </button>
                      )}
                    </td>

                    {/* Open Result Page Action */}
                    <td className="px-4 py-3.5 text-right whitespace-nowrap align-middle">
                      <button
                        onClick={() => navigate(`/result/${s.id}`)}
                        className="px-3 py-1.5 rounded-lg border border-[#D3D1C7] text-xs font-medium text-[#1B2421] bg-white hover:bg-[#0F3D3E] hover:text-white hover:border-[#0F3D3E] transition-colors shadow-2xs inline-flex items-center gap-1"
                      >
                        Review
                        <i className="ti ti-arrow-right text-[11px]"></i>
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Clinician Note Edit Modal */}
      {activeNoteModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#D3D1C7]">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <i className="ti ti-notes text-[#0F3D3E] text-xl"></i>
                <h3 className="text-base font-semibold text-[#1B2421]">Clinical Triage Note</h3>
              </div>
              <button
                onClick={() => setActiveNoteModal(null)}
                className="text-[#5F5E5A] hover:text-[#1B2421] p-1 rounded-md"
              >
                <i className="ti ti-x text-base"></i>
              </button>
            </div>

            <p className="text-xs text-[#5F5E5A] mb-3">
              Case <span className="font-mono font-semibold">#{activeNoteModal.id.slice(0, 10)}</span>. Add clinical remarks, referral destination, or consultation notes.
            </p>

            <textarea
              rows={4}
              value={modalNoteText}
              onChange={(e) => setModalNoteText(e.target.value)}
              placeholder="e.g. Discussed with on-call vitreoretinal specialist. Slit-lamp dilated exam scheduled for tomorrow 09:00 AM."
              className="w-full text-xs p-3 rounded-lg border border-[#D3D1C7] focus:outline-none focus:border-[#0F3D3E] mb-4 text-[#1B2421]"
            />

            <div className="flex items-center justify-end gap-2.5">
              <button
                onClick={() => setActiveNoteModal(null)}
                className="px-4 py-2 rounded-lg border border-[#D3D1C7] text-xs font-medium text-[#5F5E5A] hover:bg-[#F7F5F1]"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveModalNote}
                disabled={modalSaving}
                className="px-4 py-2 rounded-lg bg-[#0F3D3E] text-white text-xs font-medium hover:bg-[#0C2F30] transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {modalSaving && <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>}
                Save Note
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}