import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/useAuth'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas-pro'
import UrgencyBadge from '../components/UrgencyBadge'
import { UncertaintyBadge, ReviewFlagBadge } from '../components/UncertaintyBadge'
import EyeBadge from '../components/EyeBadge'
import type { ScreeningWithEye } from '../types/patient'
import {
  type Screening,
  type UrgencyTier,
  type TriageStatus,
  URGENCY_CONFIGS,
  STATUS_CONFIGS,
  GRADE_LABELS,
  deriveUrgency,
} from '../types/triage'

function Result() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [screening, setScreening] = useState<ScreeningWithEye | null>(null)
  const [patientCode, setPatientCode] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updatingTriage, setUpdatingTriage] = useState(false)
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('')
  const contentRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')

  // Local state for clinician notes editing
  const [notesInput, setNotesInput] = useState('')
  const [isEditingNotes, setIsEditingNotes] = useState(false)

  useEffect(() => {
    let isCancelled = false

    const loadScreening = async () => {
      if (!id) return
      setError('')

      const { data, error: queryError } = await supabase
        .from('screenings')
        .select('*')
        .eq('id', id)
        .single()

      if (isCancelled) return

      if (queryError) {
        setError(queryError.message)
        setLoading(false)
        return
      }

      // Derive triage attributes if not yet set in database
      const derived = deriveUrgency(data.grade, data.report_text)
      const normalizedScreening: Screening = {
        ...data,
        urgency_tier: data.urgency_tier || derived.tier,
        urgency_level: data.urgency_level || derived.level,
        referral_timeframe: data.referral_timeframe || derived.timeframe,
        referral_action: data.referral_action || derived.action,
        triage_status: data.triage_status || 'pending_triage',
      }

      setScreening(normalizedScreening)
      setNotesInput(normalizedScreening.triage_notes || '')

      // Feature 3: agar ye screening kisi patient se juri hai to uska code lao
      if (data.patient_id) {
        const { data: patientRow } = await supabase
          .from('patients')
          .select('patient_code')
          .eq('id', data.patient_id)
          .single()
        if (!isCancelled && patientRow) {
          setPatientCode((patientRow as { patient_code: string }).patient_code)
        }
      }

      if (data?.image_url) {
        const { data: signedData } = await supabase.storage
          .from('fundus-images')
          .createSignedUrl(data.image_url, 3600)
        if (!isCancelled && signedData) {
          setImageUrl(signedData.signedUrl)
        }
      }

      setLoading(false)
    }

    loadScreening()

    return () => {
      isCancelled = true
    }
  }, [id])

  const handleUpdateTriage = async (newStatus: TriageStatus, notesToSave?: string) => {
    if (!screening) return
    setUpdatingTriage(true)
    setSaveSuccessMsg('')
    const note = notesToSave !== undefined ? notesToSave : notesInput

    try {
      // Call backend API
      const response = await fetch(`http://127.0.0.1:8000/api/screenings/${screening.id}/triage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          triage_status: newStatus,
          triage_notes: note,
          triaged_by: user?.id,
        }),
      })

      if (!response.ok) {
        // Fallback directly to Supabase update
        const { error: directErr } = await supabase
          .from('screenings')
          .update({
            triage_status: newStatus,
            triage_notes: note,
            triaged_at: new Date().toISOString(),
            triaged_by: user?.id,
          })
          .eq('id', screening.id)

        if (directErr) throw directErr
      }

      setScreening((prev) =>
        prev
          ? {
              ...prev,
              triage_status: newStatus,
              triage_notes: note,
              triaged_at: new Date().toISOString(),
            }
          : null
      )
      setIsEditingNotes(false)
      setSaveSuccessMsg('Triage information successfully updated.')
      setTimeout(() => setSaveSuccessMsg(''), 3000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update triage status'
      setError(msg)
    } finally {
      setUpdatingTriage(false)
    }
  }

  const handleExportPDF = async () => {
    if (!contentRef.current) return
    setExporting(true)
    setExportError('')
    try {
      const canvas = await html2canvas(contentRef.current, {
        backgroundColor: '#F7F5F1',
        useCORS: true,
        allowTaint: false,
        scale: 2,
      })
      const imgData = canvas.toDataURL('image/png')

      // Page is exactly as tall as the report, so nothing gets cut off
      const pdfWidth = 210
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width
      const pdf = new jsPDF({
        orientation: pdfHeight > pdfWidth ? 'portrait' : 'landscape',
        unit: 'mm',
        format: [pdfWidth, pdfHeight],
      })
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight)
      pdf.save(`ocutriage-report-${screening?.id.slice(0, 8)}.pdf`)
    } catch (err) {
      console.error('PDF export error:', err)
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setExportError(`PDF could not be generated: ${msg}`)
    } finally {
      setExporting(false)
    }
  }

  if (loading) return <div className="p-8 text-sm text-[#888780]">Loading clinical record...</div>
  if (error) return <div className="p-8 text-sm text-[#C1544C]">{error}</div>
  if (!screening) return null

  const tier = (screening.urgency_tier as UrgencyTier) || 'ROUTINE'
  const config = URGENCY_CONFIGS[tier] || URGENCY_CONFIGS.ROUTINE
  const status = (screening.triage_status as TriageStatus) || 'pending_triage'
  const statusConfig = STATUS_CONFIGS[status] || STATUS_CONFIGS.pending_triage
  const isP1 = screening.urgency_level === 1

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Top Navigation & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="text-xs font-medium text-[#5F5E5A] hover:text-[#0F3D3E] flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#D3D1C7] bg-white transition-colors shadow-2xs"
          >
            ← Back to Dashboard
          </button>
          <button
            onClick={() => navigate('/triage')}
            className="text-xs font-medium text-[#0F3D3E] hover:bg-[#E1F5EE] flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#9FC9C4] bg-white transition-colors shadow-2xs"
          >
            <i className="ti ti-clipboard-heart"></i>
            Triage Worklist
          </button>
        </div>

        <button
          onClick={handleExportPDF}
          disabled={exporting}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#0F3D3E] text-white text-xs font-semibold hover:bg-[#0C2F30] transition-colors disabled:opacity-50 shadow-sm"
        >
          {exporting ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
              Generating Clinical PDF...
            </>
          ) : (
            <>
              <i className="ti ti-file-download text-sm"></i>
              Download Full Clinical PDF
            </>
          )}
        </button>
      </div>

      {saveSuccessMsg && (
        <div className="mb-4 bg-[#E1F5EE] text-[#04342C] border border-[#9FC9C4] px-4 py-2.5 rounded-xl text-xs font-medium flex items-center gap-2">
          <i className="ti ti-check"></i>
          {saveSuccessMsg}
        </div>
      )}

      {exportError && (
        <div className="mb-4 bg-[#FAECE7] text-[#C1544C] border border-[#FCA5A5] px-4 py-2.5 rounded-xl text-xs font-medium flex items-center gap-2">
          <i className="ti ti-alert-triangle"></i>
          {exportError}
        </div>
      )}

      {/* Printable / Viewable Clinical Content */}
      <div ref={contentRef} className="space-y-6">
        {/* Header Clinical Metadata */}
        <div className="bg-white rounded-2xl border border-[#D3D1C7] p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#0F3D3E] bg-[#E1F5EE] px-2 py-0.5 rounded-full">
                OcuTriage Decision Support
              </span>
              <span className="text-[11px] text-[#888780] font-mono">
                ID: {screening.id}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-[#1B2421]">Clinical Retinal Screening Report</h1>
            <p className="text-[#5F5E5A] text-xs mt-1">
              Screened on {new Date(screening.created_at).toLocaleDateString(undefined, { dateStyle: 'full' })} at{' '}
              {new Date(screening.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
            {screening.patient_id && (
              <div className="flex items-center gap-2 mt-2">
                <EyeBadge eye={screening.eye} showName />
                <button
                  onClick={() => navigate(`/patients/${screening.patient_id}`)}
                  className="text-[11px] font-semibold text-[#0F3D3E] hover:underline"
                >
                  Patient {patientCode ?? ''} →
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:items-end gap-1.5 shrink-0">
            <UrgencyBadge tier={tier} priority={screening.urgency_level} size="lg" />
            {(screening.uncertainty_tier || screening.needs_review) && (
              <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                <UncertaintyBadge tier={screening.uncertainty_tier} />
                <ReviewFlagBadge needsReview={screening.needs_review} />
              </div>
            )}
            <div className="flex items-center gap-1.5 text-xs text-[#5F5E5A]">
              <span>Triage Status:</span>
              <span className={`px-2 py-0.5 rounded-full font-semibold text-[11px] ${statusConfig.badgeBg} ${statusConfig.badgeText}`}>
                {statusConfig.label}
              </span>
            </div>
          </div>
        </div>

        {/* ==============================================================================
            FEATURE 1: CLINICAL REFERRAL URGENCY & ACTION CARD
        ============================================================================== */}
        <div className={`rounded-2xl border p-6 shadow-xs transition-all ${
          isP1 ? 'bg-[#FFF5F5] border-[#FCA5A5]' : 'bg-white border-[#D3D1C7]'
        }`}>
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex items-center gap-2.5">
              <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${config.badgeBg} ${config.badgeText}`}>
                <i className={`ti ${config.icon} text-lg`}></i>
              </span>
              <div>
                <h2 className="text-base font-bold text-[#1B2421]">Referral Urgency & Recommended Clinical Action</h2>
                <p className="text-xs text-[#5F5E5A]">Algorithmic protocol based on DR Severity Grade {screening.grade ?? 'Reject'}</p>
              </div>
            </div>

            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-[#888780] tracking-wider block">Target Timeframe</span>
              <span className={`inline-flex items-center gap-1 text-sm font-bold ${config.badgeText} mt-0.5`}>
                <i className="ti ti-clock text-xs"></i>
                {screening.referral_timeframe || config.timeframe}
              </span>
            </div>
          </div>

          {/* Action Callout Box */}
          <div className="bg-[#F7F5F1] rounded-xl p-4 border border-[#D3D1C7]/80 mb-5">
            <p className="text-xs font-semibold text-[#1B2421] uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <i className="ti ti-stethoscope text-sm text-[#0F3D3E]"></i>
              Clinical Recommendation:
            </p>
            <p className="text-xs text-[#1B2421] leading-relaxed font-medium">
              {screening.referral_action || config.action}
            </p>
          </div>

          {/* Interactive Clinician Triage Control Section */}
          <div className="pt-4 border-t border-[#D3D1C7]/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-xs font-semibold text-[#1B2421]">Update Triage Status:</span>
              {(['pending_triage', 'in_review', 'referred', 'completed'] as TriageStatus[]).map((st) => {
                const isCurrent = status === st
                const stCfg = STATUS_CONFIGS[st]
                return (
                  <button
                    key={st}
                    disabled={updatingTriage}
                    onClick={() => handleUpdateTriage(st)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1.5 ${
                      isCurrent
                        ? `${stCfg.badgeBg} ${stCfg.badgeText} border-current shadow-xs ring-1 ring-current`
                        : 'bg-white text-[#5F5E5A] border-[#D3D1C7] hover:border-[#0F3D3E] hover:text-[#1B2421]'
                    }`}
                  >
                    <i className={`ti ${stCfg.icon}`}></i>
                    {stCfg.label}
                  </button>
                )
              })}
            </div>

            {screening.triaged_at && (
              <span className="text-[11px] text-[#888780] font-medium">
                Last Triaged: {new Date(screening.triaged_at).toLocaleDateString()} at{' '}
                {new Date(screening.triaged_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>

          {/* Clinician Notes Section */}
          <div className="mt-4 pt-4 border-t border-[#D3D1C7]/60">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-[#1B2421] flex items-center gap-1.5">
                <i className="ti ti-notes text-xs text-[#0F3D3E]"></i>
                Clinician Triage Remarks:
              </span>
              {!isEditingNotes && (
                <button
                  onClick={() => setIsEditingNotes(true)}
                  className="text-[11px] font-medium text-[#0F3D3E] hover:underline"
                >
                  {screening.triage_notes ? 'Edit Remarks' : '+ Add Remarks'}
                </button>
              )}
            </div>

            {isEditingNotes ? (
              <div className="space-y-2">
                <textarea
                  rows={2}
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  placeholder="Enter clinical handover notes, specialist referral hospital, or schedule date..."
                  className="w-full text-xs p-2.5 rounded-lg border border-[#D3D1C7] bg-white focus:outline-none focus:border-[#0F3D3E]"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setIsEditingNotes(false)}
                    className="px-3 py-1 text-xs rounded border border-[#D3D1C7] text-[#5F5E5A] hover:bg-white"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleUpdateTriage(status, notesInput)}
                    disabled={updatingTriage}
                    className="px-3 py-1 text-xs rounded bg-[#0F3D3E] text-white font-medium hover:bg-[#0C2F30]"
                  >
                    Save Remarks
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-[#5F5E5A] italic bg-[#F7F5F1] px-3 py-2 rounded-lg border border-[#D3D1C7]/60">
                {screening.triage_notes || 'No clinician remarks entered for this screening yet.'}
              </p>
            )}
          </div>
        </div>

        {/* Fundus Image and Heatmap Analysis */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="bg-white rounded-2xl border border-[#D3D1C7] p-5 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-[#5F5E5A] uppercase tracking-wider">Original Fundus Scan</p>
              <span className="text-[10px] text-[#888780] font-mono">Input Image</span>
            </div>
            {imageUrl ? (
              <img
                src={imageUrl}
                alt="Fundus scan"
                crossOrigin="anonymous"
                className="w-full h-64 object-contain rounded-xl bg-black/5 border border-[#D3D1C7]"
              />
            ) : (
              <div className="h-64 flex items-center justify-center text-xs text-[#888780] bg-[#F7F5F1] rounded-xl">
                Fundus image not accessible
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-[#D3D1C7] p-5 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-[#5F5E5A] uppercase tracking-wider">
                Grad-CAM Visual Explanation
              </p>
              <span className="text-[10px] text-[#0F3D3E] font-medium bg-[#E1F5EE] px-2 py-0.5 rounded">
                Pathology Heatmap
              </span>
            </div>
            {screening.heatmap_url ? (
              <img
                src={screening.heatmap_url}
                alt="Heatmap"
                crossOrigin="anonymous"
                className="w-full h-64 object-contain rounded-xl bg-black/5 border border-[#D3D1C7]"
              />
            ) : (
              <div className="h-64 flex items-center justify-center text-xs text-[#888780] bg-[#F7F5F1] rounded-xl">
                Grad-CAM visual explanation not generated
              </div>
            )}
          </div>
        </div>

        {/* Feature 2: Model Uncertainty & Specialist Review */}
        {screening.uncertainty_tier && (
          <div
            className={`rounded-2xl border p-5 shadow-xs ${
              screening.needs_review ? 'bg-[#FFF5F5] border-[#FCA5A5]' : 'bg-white border-[#D3D1C7]'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-xs font-semibold text-[#5F5E5A] uppercase tracking-wider mb-1">
                  Model Uncertainty
                </h3>
                <p className="text-xs text-[#5F5E5A] leading-relaxed">
                  {screening.uncertainty_tier === 'LOW' &&
                    'The model gave a stable answer across several variations of this image.'}
                  {screening.uncertainty_tier === 'MEDIUM' &&
                    'The model showed some variation across several versions of this image.'}
                  {screening.uncertainty_tier === 'HIGH' &&
                    'The model was not consistent across versions of this image. A specialist should verify this result.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                <UncertaintyBadge tier={screening.uncertainty_tier} />
                <ReviewFlagBadge needsReview={screening.needs_review} />
              </div>
            </div>
          </div>
        )}

        {/* AI Model Findings & Confidence */}
        <div className="bg-white rounded-2xl border border-[#D3D1C7] p-6 shadow-xs">
          <h3 className="text-xs font-semibold text-[#5F5E5A] uppercase tracking-wider mb-4">
            AI Diagnosis & Model Classification
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
            <div className="p-4 rounded-xl bg-[#F7F5F1] border border-[#D3D1C7]/70">
              <p className="text-[11px] font-semibold text-[#5F5E5A] mb-1">Diabetic Retinopathy Grade</p>
              <p className="text-lg font-bold text-[#1B2421]">
                {screening.grade !== null ? `${screening.grade} - ${GRADE_LABELS[screening.grade]}` : 'Ungradable'}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#F7F5F1] border border-[#D3D1C7]/70">
              <p className="text-[11px] font-semibold text-[#5F5E5A] mb-1">Model Confidence</p>
              <p className="text-lg font-bold text-[#1B2421]">
                {screening.confidence !== null ? `${Math.round(screening.confidence * 100)}%` : '—'}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#F7F5F1] border border-[#D3D1C7]/70 col-span-2 sm:col-span-1">
              <p className="text-[11px] font-semibold text-[#5F5E5A] mb-1">Severity Classification</p>
              <p className="text-sm font-bold text-[#0F3D3E] mt-1">
                {screening.grade === 4
                  ? 'Proliferative DR'
                  : screening.grade === 3
                  ? 'Severe Non-Proliferative'
                  : screening.grade === 2
                  ? 'Moderate Non-Proliferative'
                  : screening.grade === 1
                  ? 'Mild Non-Proliferative'
                  : screening.grade === 0
                  ? 'No Evidence of DR'
                  : 'Not assessable'}
              </p>
            </div>
          </div>

          {/* AI Clinical Narrative */}
          <div className="mt-4 pt-4 border-t border-[#D3D1C7]/60">
            <p className="text-xs font-semibold text-[#5F5E5A] uppercase tracking-wider mb-2">
              Generated Clinical Summary
            </p>
            <p className="text-xs text-[#1B2421] leading-relaxed bg-[#F7F5F1] p-4 rounded-xl border border-[#D3D1C7]/70">
              {screening.report_text ||
                (screening.grade === null
                  ? 'No AI grading was performed because this image could not be graded. Please recapture the fundus photograph.'
                  : 'Report text pending inference generation.')}
            </p>
          </div>
        </div>

        {/* Regulatory Disclaimer */}
        <p className="text-[11px] text-[#888780] text-center leading-relaxed">
          OcuTriage is an assistive clinical decision support tool designed to streamline patient triage. It does not replace comprehensive in-person slit-lamp biomicroscopy or formal ophthalmologist diagnosis.
        </p>
      </div>
    </div>
  )
}

export default Result