import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

interface Screening {
  id: string
  image_url: string | null
  heatmap_url: string | null
  grade: number | null
  confidence: number | null
  report_text: string | null
  created_at: string
}

const gradeLabels: Record<number, string> = {
  0: 'No DR',
  1: 'Mild',
  2: 'Moderate',
  3: 'Severe',
  4: 'Proliferative',
}

function Result() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [screening, setScreening] = useState<Screening | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const contentRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState(false)

  const fetchScreening = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('screenings')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setScreening(data)

    if (data.image_url) {
      const { data: signedData } = await supabase.storage
        .from('fundus-images')
        .createSignedUrl(data.image_url, 3600)
      if (signedData) setImageUrl(signedData.signedUrl)
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchScreening()
  }, [id])

  const handleExportPDF = async () => {
    if (!contentRef.current) return
    setExporting(true)
    const canvas = await html2canvas(contentRef.current, { backgroundColor: '#F7F5F1' })
    const imgData = canvas.toDataURL('image/png')
    const pdf = new jsPDF('p', 'mm', 'a4')
    const pdfWidth = pdf.internal.pageSize.getWidth()
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight)
    pdf.save(`screening-report-${screening?.id}.pdf`)
    setExporting(false)
  }

  if (loading) return <div className="p-8 text-sm text-[#888780]">Loading...</div>
  if (error) return <div className="p-8 text-sm text-[#C1544C]">{error}</div>
  if (!screening) return null

  return (
    <div className="p-8 max-w-3xl" ref={contentRef}>
      <button
        onClick={() => navigate('/dashboard')}
        className="text-sm text-[#5F5E5A] hover:text-[#0F3D3E] mb-4"
      >
        ← Back to dashboard
      </button>

      <div className="flex items-center justify-between mb-4">
        <div></div>
        <button
          onClick={handleExportPDF}
          disabled={exporting}
          className="px-4 py-2 rounded-lg border border-[#D3D1C7] text-sm font-medium text-[#1B2421] hover:bg-white transition-colors disabled:opacity-50"
        >
          {exporting ? 'Generating PDF...' : 'Download PDF'}
        </button>
      </div>

      <h1 className="text-2xl font-semibold text-[#1B2421] mb-1">Screening result</h1>
      <p className="text-[#5F5E5A] text-sm mb-8">
        {new Date(screening.created_at).toLocaleDateString()}
      </p>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-[#D3D1C7] p-4">
          <p className="text-xs font-medium text-[#5F5E5A] mb-2">Original image</p>
          {imageUrl ? (
            <img src={imageUrl} alt="Fundus scan" className="w-full rounded-lg" />
          ) : (
            <div className="h-48 flex items-center justify-center text-xs text-[#888780]">No image</div>
          )}
        </div>
        <div className="bg-white rounded-xl border border-[#D3D1C7] p-4">
          <p className="text-xs font-medium text-[#5F5E5A] mb-2">Grad-CAM heatmap</p>
          {screening.heatmap_url ? (
            <img src={screening.heatmap_url} alt="Heatmap" className="w-full rounded-lg" />
          ) : (
            <div className="h-48 flex items-center justify-center text-xs text-[#888780]">Not generated yet</div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-[#D3D1C7] p-6 mb-6">
        <div className="flex items-center gap-4 mb-4">
          <div>
            <p className="text-xs font-medium text-[#5F5E5A] mb-1">Grade</p>
            {screening.grade !== null ? (
              <span className="px-3 py-1.5 rounded-full text-sm font-medium bg-[#E1F5EE] text-[#04342C]">
                {gradeLabels[screening.grade] ?? screening.grade}
              </span>
            ) : (
              <span className="px-3 py-1.5 rounded-full text-sm font-medium bg-[#FAEEDA] text-[#633806]">
                Processing
              </span>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-[#5F5E5A] mb-1">Confidence</p>
            <p className="text-sm text-[#1B2421]">
              {screening.confidence !== null ? `${Math.round(screening.confidence * 100)}%` : '—'}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-[#D3D1C7] p-6">
        <p className="text-xs font-medium text-[#5F5E5A] mb-2">AI-generated report</p>
        <p className="text-sm text-[#1B2421] leading-relaxed">
          {screening.report_text || 'Report will be available once processing is complete.'}
        </p>
      </div>
    </div>
  )
}

export default Result