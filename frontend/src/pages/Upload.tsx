import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/useAuth'
import EyeBadge from '../components/EyeBadge'
import { formatDate, type Eye, type Visit } from '../types/patient'

function Upload() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user, session } = useAuth()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  // Feature 3: patient patient page se link ho kar aaye to ye teen cheezein milti hain
  const patientId = searchParams.get('patient')
  const visitId = searchParams.get('visit')
  const eyeParam = searchParams.get('eye')
  const eye: Eye | null = eyeParam === 'OD' || eyeParam === 'OS' ? eyeParam : null
  const isLinked = Boolean(patientId && visitId && eye)

  const [linkInfo, setLinkInfo] = useState<{ patientCode: string; visitDate: string } | null>(null)
  const [linkError, setLinkError] = useState('')

  useEffect(() => {
    if (!patientId || !visitId || !eye) return
    let cancelled = false

    const verifyLink = async () => {
      const { data: visit } = await supabase.from('visits').select('*').eq('id', visitId).single()
      const { data: patient } = await supabase
        .from('patients')
        .select('patient_code')
        .eq('id', patientId)
        .single()
      if (cancelled) return

      const v = visit as Visit | null
      if (!v || !patient || v.patient_id !== patientId) {
        setLinkError('This patient or visit was not found in your records. Open the patient page and try again.')
        return
      }
      setLinkError('')
      setLinkInfo({
        patientCode: (patient as { patient_code: string }).patient_code,
        visitDate: v.visit_date,
      })
    }

    verifyLink()
    return () => {
      cancelled = true
    }
  }, [patientId, visitId, eye])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (selected) {
      // Validate file size (max 15MB)
      if (selected.size > 15 * 1024 * 1024) {
        setError('Image file size must be less than 15MB.')
        return
      }

      // Validate MIME type
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(selected.type)) {
        setError('Please select a valid image file (JPG, PNG, or WebP).')
        return
      }

      setFile(selected)
      setPreview(URL.createObjectURL(selected))
      setMessage('')
      setError('')
    }
  }

  const handleUpload = async () => {
    if (!file) return
    if (!user) {
      setError('You must be signed in to upload.')
      return
    }
    if (isLinked && !linkInfo) {
      setError('Patient link is not verified yet. Please wait a moment or go back to the patient page.')
      return
    }

    setUploading(true)
    setError('')
    setMessage('')

    const filePath = `${user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`

    const { error: uploadError } = await supabase.storage
      .from('fundus-images')
      .upload(filePath, file)

    if (uploadError) {
      setError(`Upload to storage failed: ${uploadError.message}`)
      setUploading(false)
      return
    }

    const { data: insertedRow, error: dbError } = await supabase
      .from('screenings')
      .insert({
        user_id: user.id,
        image_url: filePath,
        ...(isLinked ? { patient_id: patientId, visit_id: visitId, eye } : {}),
      })
      .select()
      .single()

    if (dbError) {
      setError(`Database error: ${dbError.message}`)
      setUploading(false)
      return
    }

    setMessage('Image uploaded. Processing AI inference and Grad-CAM explanation...')

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }

      const response = await fetch('http://127.0.0.1:8000/process-screening', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          screening_id: insertedRow.id,
          image_path: filePath,
        }),
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        const errorMessage = typeof errData.detail === 'string'
          ? errData.detail
          : errData.detail?.quality_issues?.join(', ') || 'Processing failed.'
        setError(isLinked ? `${errorMessage}. Please retake this eye's photo and upload again.` : errorMessage)
        setUploading(false)
        return
      }

      setMessage(isLinked ? 'Screening complete! Returning to patient record...' : 'Screening complete! Redirecting to report...')
      setTimeout(() => {
        navigate(isLinked ? `/patients/${patientId}` : `/result/${insertedRow.id}`)
      }, 800)
    } catch {
      setMessage('Image uploaded, but backend inference could not be contacted. Screening remains pending.')
    }

    setUploading(false)
    setFile(null)
    setPreview(null)
  }

  return (
    <div className="p-8 max-w-2xl">
      {isLinked && (
        <button
          onClick={() => navigate(`/patients/${patientId}`)}
          className="mb-4 text-xs font-medium text-[#5F5E5A] hover:text-[#0F3D3E] px-2.5 py-1.5 rounded-lg border border-[#D3D1C7] bg-white"
        >
          ← Back to patient
        </button>
      )}

      <h1 className="text-2xl font-semibold text-[#1B2421] mb-1">
        {isLinked ? 'Upload eye scan' : 'Upload screening'}
      </h1>
      <p className="text-[#5F5E5A] text-sm mb-6">
        Upload a fundus image to get an AI-assisted diabetic retinopathy grade.
      </p>

      {isLinked && (
        <div className="mb-6 flex flex-wrap items-center gap-2 bg-[#E1F5EE] border border-[#9FC9C4] text-[#04342C] px-4 py-3 rounded-xl text-sm">
          {linkInfo ? (
            <>
              <span>
                Patient <span className="font-mono font-bold">{linkInfo.patientCode}</span>
              </span>
              <span>·</span>
              <span>Visit {formatDate(linkInfo.visitDate)}</span>
              <span>·</span>
              <EyeBadge eye={eye} showName />
            </>
          ) : linkError ? (
            <span className="text-[#C1544C]">{linkError}</span>
          ) : (
            <span>Checking patient record...</span>
          )}
        </div>
      )}

      <div className="bg-white rounded-xl border border-[#D3D1C7] p-8 shadow-sm">
        {!preview ? (
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-[#D3D1C7] rounded-lg py-16 cursor-pointer hover:border-[#0F3D3E] transition-colors">
            <i className="ti ti-cloud-upload text-[#888780] mb-3" style={{ fontSize: '32px' }}></i>
            <span className="text-sm font-medium text-[#1B2421] mb-1">Click to select a fundus image</span>
            <span className="text-xs text-[#888780]">JPG or PNG (max 15MB)</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileChange} className="hidden" />
          </label>
        ) : (
          <div>
            <img src={preview} alt="Selected fundus scan" className="w-full max-h-80 object-contain rounded-lg mb-4" />
            <div className="flex gap-3">
              <button
                onClick={handleUpload}
                disabled={uploading || (isLinked && !linkInfo)}
                className="flex-1 py-2.5 rounded-lg bg-[#0F3D3E] text-white text-sm font-medium hover:bg-[#0C2F30] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {uploading && (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                )}
                {uploading ? 'Processing screening...' : 'Upload for screening'}
              </button>
              <button
                onClick={() => { setFile(null); setPreview(null) }}
                disabled={uploading}
                className="px-4 py-2.5 rounded-lg border border-[#D3D1C7] text-sm font-medium text-[#5F5E5A] hover:bg-[#F7F5F1] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {message && (
          <p className="mt-4 text-sm text-[#04342C] bg-[#E1F5EE] px-3 py-2 rounded-lg">{message}</p>
        )}
        {error && (
          <p className="mt-4 text-sm text-[#C1544C] bg-[#FAECE7] px-3 py-2 rounded-lg">{error}</p>
        )}
      </div>
    </div>
  )
}

export default Upload