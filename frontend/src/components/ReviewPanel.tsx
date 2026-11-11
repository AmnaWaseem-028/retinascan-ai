import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/useAuth'
import { GRADE_LABELS } from '../types/triage'
import type { Review } from '../types/review'
const GRADES = [0, 1, 2, 3, 4]
const gradeText = (g: number | null) => (g === null ? 'Ungradable' : `${g} - ${GRADE_LABELS[g]}`)
// Chhota badge: report ke header mein "AI preliminary" ya "Clinician verified" dikhata hai
export function ReviewStatusBadge({ review }: { review: Review | null }) {
  if (!review) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#FEF3C7] text-[#92400E]">
        <i className="ti ti-robot"></i>
        AI preliminary
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#E1F5EE] text-[#04342C]">
      <i className="ti ti-user-check"></i>
      Clinician verified
    </span>
  )
}
interface ReviewPanelProps {
  screeningId: string
  aiGrade: number | null
  review: Review | null
  onSaved: (review: Review) => void
}
export default function ReviewPanel({ screeningId, aiGrade, review, onSaved }: ReviewPanelProps) {
  const { user } = useAuth()
  const [editing, setEditing] = useState(false)
  const [finalGrade, setFinalGrade] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const startEditing = () => {
    setFinalGrade(review ? review.final_grade : aiGrade)
    setNotes(review?.notes ?? '')
    setError('')
    setEditing(true)
  }
  const handleSave = async () => {
    if (finalGrade === null) {
      setError('Please choose a final grade.')
      return
    }
    if (!user) {
      setError('You must be signed in to save a review.')
      return
    }
    setSaving(true)
    setError('')
    const { data, error: saveErr } = await supabase
      .from('reviews')
      .upsert(
        {
          screening_id: screeningId,
          reviewer_id: user.id,
          ai_grade: aiGrade,
          final_grade: finalGrade,
          notes: notes.trim() || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'screening_id' }
      )
      .select()
      .single()
    setSaving(false)
    if (saveErr || !data) {
      setError(saveErr?.message || 'Review could not be saved.')
      return
    }
    onSaved(data as Review)
    setEditing(false)
  }
  const isOverride = finalGrade !== null && finalGrade !== aiGrade
  return (
    <div
      className={`rounded-2xl border p-6 shadow-xs ${
        review ? 'bg-white border-[#9FC9C4]' : 'bg-[#FFFBEB] border-[#FCD34D]'
      }`}
    >
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h3 className="text-base font-bold text-[#1B2421]">Clinician Review</h3>
          <p className="text-xs text-[#5F5E5A] mt-0.5">
            A clinician confirms or corrects the AI grade. The AI result stays on record either way.
          </p>
        </div>
        <ReviewStatusBadge review={review} />
      </div>
      {error && (
        <div className="mb-3 bg-[#FAECE7] text-[#C1544C] border border-[#FCA5A5] px-3 py-2 rounded-lg text-xs">
          {error}
        </div>
      )}
      {/* Halat 1: review nahi hua */}
      {!review && !editing && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-xs text-[#92400E]">
            This is an AI preliminary result. It has not been checked by a clinician yet.
          </p>
          <button
            data-html2canvas-ignore="true"
            onClick={startEditing}
            className="px-4 py-2 rounded-lg bg-[#0F3D3E] text-white text-xs font-semibold hover:bg-[#0C2F30] transition-colors"
          >
            Review this case
          </button>
        </div>
      )}
      {/* Halat 2: form khula hai */}
      {editing && (
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-[#1B2421]">
                Final grade (AI said: {gradeText(aiGrade)})
              </span>
              {aiGrade !== null && (
                <button
                  onClick={() => setFinalGrade(aiGrade)}
                  className="text-[11px] font-medium text-[#0F3D3E] hover:underline"
                >
                  Agree with AI
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {GRADES.map((g) => (
                <button
                  key={g}
                  onClick={() => setFinalGrade(g)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    finalGrade === g
                      ? 'bg-[#0F3D3E] text-white border-[#0F3D3E]'
                      : 'bg-white text-[#5F5E5A] border-[#D3D1C7] hover:border-[#0F3D3E]'
                  }`}
                >
                  {g} - {GRADE_LABELS[g]}
                </button>
              ))}
            </div>
            {isOverride && (
              <p className="text-[11px] text-[#BE123C] font-medium mt-2">
                You are overriding the AI grade. Please add a short reason in the notes.
              </p>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-[#1B2421] block mb-1.5">Notes</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Hard exudates near the macula, grade raised to moderate."
              className="w-full text-xs p-2.5 rounded-lg border border-[#D3D1C7] bg-white focus:outline-none focus:border-[#0F3D3E]"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setEditing(false)}
              disabled={saving}
              className="px-3 py-1.5 text-xs rounded-lg border border-[#D3D1C7] text-[#5F5E5A] hover:bg-white"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-1.5 text-xs rounded-lg bg-[#0F3D3E] text-white font-semibold hover:bg-[#0C2F30] disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save review'}
            </button>
          </div>
        </div>
      )}
      {/* Halat 3: review ho chuka hai */}
      {review && !editing && (
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <div className="p-3 rounded-xl bg-[#F7F5F1] border border-[#D3D1C7]/70">
              <p className="text-[11px] font-semibold text-[#5F5E5A] mb-1">AI grade</p>
              <p className="text-sm font-bold text-[#1B2421]">{gradeText(review.ai_grade)}</p>
            </div>
            <div className="p-3 rounded-xl bg-[#E1F5EE] border border-[#9FC9C4]">
              <p className="text-[11px] font-semibold text-[#04342C] mb-1">Clinician grade</p>
              <p className="text-sm font-bold text-[#04342C]">{gradeText(review.final_grade)}</p>
            </div>
            <div className="p-3 rounded-xl bg-[#F7F5F1] border border-[#D3D1C7]/70">
              <p className="text-[11px] font-semibold text-[#5F5E5A] mb-1">Agreement</p>
              <p
                className={`text-sm font-bold ${
                  review.agrees_with_ai ? 'text-[#0F6E56]' : 'text-[#BE123C]'
                }`}
              >
                {review.agrees_with_ai ? 'Agrees with AI' : 'Overrides AI'}
              </p>
            </div>
          </div>
          <p className="text-xs text-[#1B2421] bg-[#F7F5F1] px-3 py-2 rounded-lg border border-[#D3D1C7]/60">
            {review.notes || 'No notes were added.'}
          </p>
          <div className="flex items-center justify-between mt-3">
            <span className="text-[11px] text-[#888780]">
              Reviewed on {new Date(review.updated_at).toLocaleString()}
            </span>
            <button
              data-html2canvas-ignore="true"
              onClick={startEditing}
              className="text-[11px] font-medium text-[#0F3D3E] hover:underline"
            >
              Edit review
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
