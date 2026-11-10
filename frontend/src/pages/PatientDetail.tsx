import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/useAuth'
import UrgencyBadge from '../components/UrgencyBadge'
import { UncertaintyBadge, ReviewFlagBadge } from '../components/UncertaintyBadge'
import EyeBadge from '../components/EyeBadge'
import ProgressionBadge from '../components/ProgressionBadge'
import LongitudinalChart from '../components/LongitudinalChart'
import { GRADE_LABELS } from '../types/triage'
import {
  DIABETES_LABELS,
  SEX_LABELS,
  buildTimeline,
  formatDate,
  type Eye,
  type Patient,
  type ScreeningWithEye,
  type Visit,
} from '../types/patient'

function HeatmapTile({ scan }: { scan: ScreeningWithEye | null }) {
  if (!scan || scan.grade === null || !scan.heatmap_url) {
    return (
      <div className="h-36 flex items-center justify-center rounded-xl bg-[#F7F5F1] text-[11px] text-[#888780]">
        {scan ? 'Not graded' : 'No scan'}
      </div>
    )
  }
  return (
    <img
      src={scan.heatmap_url}
      alt="Grad-CAM heatmap"
      className="h-36 w-full rounded-xl border border-[#D3D1C7] bg-black/5 object-contain"
    />
  )
}

function EyeCell({
  eye,
  scan,
  onAdd,
  onOpen,
}: {
  eye: Eye
  scan: ScreeningWithEye | null
  onAdd: () => void
  onOpen: (id: string) => void
}) {
  const grade = scan?.grade ?? null
  return (
    <div className="rounded-xl border border-[#D3D1C7] bg-[#FBFAF8] p-4">
      <div className="flex items-center justify-between mb-2">
        <EyeBadge eye={eye} showName />
        {scan && (
          <button onClick={() => onOpen(scan.id)} className="text-[11px] font-medium text-[#0F3D3E] hover:underline">
            Open report →
          </button>
        )}
      </div>

      {scan && grade !== null ? (
        <div className="space-y-2">
          <p className="text-sm font-bold text-[#1B2421]">
            {grade} - {GRADE_LABELS[grade]}{' '}
            <span className="text-[11px] font-normal text-[#5F5E5A]">
              ({scan.confidence ? `${Math.round(scan.confidence * 100)}%` : '—'})
            </span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            <UncertaintyBadge tier={scan.uncertainty_tier} />
            <ReviewFlagBadge needsReview={scan.needs_review} reason={scan.review_reason} />
          </div>
          <HeatmapTile scan={scan} />
        </div>
      ) : (
        <p className="text-xs text-[#5F5E5A] mb-2">
          {scan ? 'Not graded (quality failed or still processing).' : 'No scan yet.'}
        </p>
      )}

      {grade === null && (
        <button
          onClick={onAdd}
          className="mt-2 px-3 py-1.5 rounded-lg border border-[#9FC9C4] bg-white text-xs font-medium text-[#0F3D3E] hover:bg-[#E1F5EE]"
        >
          + {scan ? 'Re-upload' : 'Add'} {eye === 'OD' ? 'right' : 'left'} eye scan
        </button>
      )}
    </div>
  )
}

export default function PatientDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [patient, setPatient] = useState<Patient | null>(null)
  const [visits, setVisits] = useState<Visit[]>([])
  const [screenings, setScreenings] = useState<ScreeningWithEye[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [newVisitDate, setNewVisitDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [creating, setCreating] = useState(false)
  const [cmpA, setCmpA] = useState('')
  const [cmpB, setCmpB] = useState('')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!id) return
      const [p, v, s] = await Promise.all([
        supabase.from('patients').select('*').eq('id', id).single(),
        supabase.from('visits').select('*').eq('patient_id', id).order('visit_date', { ascending: true }),
        supabase.from('screenings').select('*').eq('patient_id', id).order('created_at', { ascending: true }),
      ])
      if (cancelled) return
      if (p.error) {
        setError(p.error.message)
        setLoading(false)
        return
      }
      if (v.error || s.error) {
        setError(v.error?.message || s.error?.message || 'Failed to load records')
        setLoading(false)
        return
      }
      setPatient(p.data as Patient)
      setVisits((v.data || []) as Visit[])
      setScreenings((s.data || []) as ScreeningWithEye[])
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [id, reloadKey])

  const timeline = useMemo(() => buildTimeline(visits, screenings), [visits, screenings])

  if (loading) return <div className="p-8 text-sm text-[#888780]">Loading patient record...</div>
  if (!patient) return <div className="p-8 text-sm text-[#C1544C]">{error || 'Patient not found'}</div>

  const latest = timeline.length > 0 ? timeline[timeline.length - 1] : null
  const compareA = timeline.find((t) => t.visit.id === cmpA) ?? timeline[timeline.length - 2]
  const compareB = timeline.find((t) => t.visit.id === cmpB) ?? timeline[timeline.length - 1]

  const handleAddVisit = async () => {
    if (!user) {
      setError('Please sign in again.')
      return
    }
    setCreating(true)
    setError('')
    const { error: insErr } = await supabase
      .from('visits')
      .insert({ patient_id: patient.id, user_id: user.id, visit_date: newVisitDate })
    setCreating(false)
    if (insErr) {
      setError(insErr.message)
      return
    }
    setReloadKey((k) => k + 1)
  }

  const goUpload = (visitId: string, eye: Eye) =>
    navigate(`/upload?patient=${patient.id}&visit=${visitId}&eye=${eye}`)

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <button
        onClick={() => navigate('/patients')}
        className="text-xs font-medium text-[#5F5E5A] hover:text-[#0F3D3E] px-2.5 py-1.5 rounded-lg border border-[#D3D1C7] bg-white"
      >
        ← Patients
      </button>

      {error && (
        <div className="bg-[#FAECE7] border border-[#FCA5A5] text-[#C1544C] px-4 py-3 rounded-xl text-sm">{error}</div>
      )}

      {/* Patient header + patient-level result */}
      <div className="bg-white rounded-2xl border border-[#D3D1C7] p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#0F3D3E] bg-[#E1F5EE] px-2 py-0.5 rounded-full">
            Patient record
          </span>
          <h1 className="text-2xl font-bold text-[#1B2421] mt-2 font-mono">{patient.patient_code}</h1>
          <p className="text-xs text-[#5F5E5A] mt-1">
            {patient.age} yrs · {SEX_LABELS[patient.sex]} · Diabetes {DIABETES_LABELS[patient.diabetes_type]}
            {patient.diabetes_duration_years !== null && ` (${patient.diabetes_duration_years} yrs)`}
            {patient.hba1c !== null && ` · HbA1c ${patient.hba1c}%`}
          </p>
        </div>
        <div className="flex flex-col md:items-end gap-1.5">
          <span className="text-[10px] uppercase font-bold text-[#888780] tracking-wider">
            Latest patient-level result (worse eye)
          </span>
          {latest && latest.overallGrade !== null && latest.urgency ? (
            <>
              <p className="text-sm font-bold text-[#1B2421]">
                Grade {latest.overallGrade} - {GRADE_LABELS[latest.overallGrade]}
              </p>
              <UrgencyBadge tier={latest.urgency.tier} priority={latest.urgency.level} size="md" />
              <ProgressionBadge status={latest.status} worsenedEyes={latest.worsenedEyes} />
            </>
          ) : (
            <span className="text-xs text-[#5F5E5A]">No graded scans yet</span>
          )}
        </div>
      </div>

      {latest?.status === 'progression' && (
        <div className="bg-[#FFF1F2] border border-[#FDA4AF] text-[#BE123C] px-4 py-3 rounded-xl text-xs font-medium">
          Progression flagged at the latest visit. This is based on AI grades, so please confirm clinically.
        </div>
      )}

      <LongitudinalChart timeline={timeline} />

      {/* New visit */}
      <div className="bg-white rounded-2xl border border-[#D3D1C7] p-5 shadow-xs flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold text-[#1B2421]">
          New visit date
          <input
            type="date"
            value={newVisitDate}
            onChange={(e) => setNewVisitDate(e.target.value)}
            className="block mt-1 text-xs p-2.5 rounded-lg border border-[#D3D1C7] bg-white"
          />
        </label>
        <button
          onClick={handleAddVisit}
          disabled={creating || !newVisitDate}
          className="px-4 py-2.5 rounded-lg bg-[#0F3D3E] text-white text-xs font-semibold hover:bg-[#0C2F30] disabled:opacity-50"
        >
          {creating ? 'Adding...' : '+ Add visit'}
        </button>
      </div>

      {/* Visits (newest first) */}
      {timeline.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#D3D1C7] p-10 text-center text-sm text-[#5F5E5A]">
          No visits yet. Add a visit, then upload the right-eye and left-eye scans.
        </div>
      ) : (
        [...timeline].reverse().map((t) => (
          <div key={t.visit.id} className="bg-white rounded-2xl border border-[#D3D1C7] p-5 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <h2 className="text-base font-bold text-[#1B2421]">Visit {formatDate(t.visit.visit_date)}</h2>
                <ProgressionBadge status={t.status} worsenedEyes={t.worsenedEyes} />
              </div>
              {t.overallGrade !== null && t.urgency && (
                <div className="flex items-center gap-2 text-xs text-[#5F5E5A]">
                  Patient-level: Grade {t.overallGrade}
                  <UrgencyBadge tier={t.urgency.tier} priority={t.urgency.level} size="md" />
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <EyeCell eye="OD" scan={t.od} onAdd={() => goUpload(t.visit.id, 'OD')} onOpen={(sid) => navigate(`/result/${sid}`)} />
              <EyeCell eye="OS" scan={t.os} onAdd={() => goUpload(t.visit.id, 'OS')} onOpen={(sid) => navigate(`/result/${sid}`)} />
            </div>
          </div>
        ))
      )}

      {/* Side-by-side comparison */}
      {timeline.length >= 2 && compareA && compareB && (
        <div className="bg-white rounded-2xl border border-[#D3D1C7] p-5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-base font-bold text-[#1B2421]">Compare two visits</h2>
            <div className="flex items-center gap-2 text-xs">
              <select
                value={compareA.visit.id}
                onChange={(e) => setCmpA(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-[#D3D1C7] bg-white"
              >
                {timeline.map((t) => (
                  <option key={t.visit.id} value={t.visit.id}>
                    {formatDate(t.visit.visit_date)}
                  </option>
                ))}
              </select>
              <span className="text-[#5F5E5A]">vs</span>
              <select
                value={compareB.visit.id}
                onChange={(e) => setCmpB(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-[#D3D1C7] bg-white"
              >
                {timeline.map((t) => (
                  <option key={t.visit.id} value={t.visit.id}>
                    {formatDate(t.visit.visit_date)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {(['OD', 'OS'] as Eye[]).map((eye) => (
            <div key={eye} className="mb-5 last:mb-0">
              <EyeBadge eye={eye} showName />
              <div className="grid grid-cols-2 gap-4 mt-2">
                {[compareA, compareB].map((t, idx) => {
                  const scan = eye === 'OD' ? t.od : t.os
                  return (
                    <div key={idx}>
                      <p className="text-[11px] text-[#5F5E5A] mb-1">
                        {formatDate(t.visit.visit_date)} ·{' '}
                        {scan && scan.grade !== null ? `Grade ${scan.grade} (${GRADE_LABELS[scan.grade]})` : 'No graded scan'}
                      </p>
                      <HeatmapTile scan={scan} />
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-[#888780] text-center leading-relaxed">
        Progression and patient-level urgency are derived from AI grades. They support, and do not replace, clinical assessment.
      </p>
    </div>
  )
}