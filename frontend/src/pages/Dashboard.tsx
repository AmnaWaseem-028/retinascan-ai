import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

interface Screening {
  id: string
  image_url: string | null
  grade: number | null
  confidence: number | null
  created_at: string
}

const gradeLabels: Record<number, string> = {
  0: 'No DR',
  1: 'Mild',
  2: 'Moderate',
  3: 'Severe',
  4: 'Proliferative',
}

function Dashboard() {
  const navigate = useNavigate()
  const [screenings, setScreenings] = useState<Screening[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchScreenings = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('screenings')
      .select('id, image_url, grade, confidence, created_at')
      .order('created_at', { ascending: false })

    if (error) {
      setError(error.message)
    } else {
      setScreenings(data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchScreenings()
  }, [])

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-[#1B2421] mb-1">Screening history</h1>
      <p className="text-[#5F5E5A] text-sm mb-8">All your past diabetic retinopathy screenings.</p>

      {loading && <p className="text-sm text-[#888780]">Loading...</p>}
      {error && <p className="text-sm text-[#C1544C]">{error}</p>}

      {!loading && screenings.length === 0 && (
        <div className="bg-white rounded-xl border border-[#D3D1C7] p-12 text-center">
          <p className="text-sm text-[#5F5E5A]">No screenings yet. Upload a fundus image to get started.</p>
        </div>
      )}

      {!loading && screenings.length > 0 && (
        <div className="bg-white rounded-xl border border-[#D3D1C7] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#D3D1C7] text-left">
                <th className="px-5 py-3 font-medium text-[#5F5E5A]">Date</th>
                <th className="px-5 py-3 font-medium text-[#5F5E5A]">Grade</th>
                <th className="px-5 py-3 font-medium text-[#5F5E5A]">Confidence</th>
                <th className="px-5 py-3 font-medium text-[#5F5E5A]">Status</th>
              </tr>
            </thead>
            <tbody>
              {screenings.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => navigate(`/result/${s.id}`)}
                  className="border-b border-[#D3D1C7] last:border-0 hover:bg-[#F7F5F1] cursor-pointer"
                >
                  <td className="px-5 py-3 text-[#1B2421]">
                    {new Date(s.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-3">
                    {s.grade !== null ? (
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-[#E1F5EE] text-[#04342C]">
                        {gradeLabels[s.grade] ?? s.grade}
                      </span>
                    ) : (
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-[#FAEEDA] text-[#633806]">
                        Processing
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-[#1B2421]">
                    {s.confidence !== null ? `${Math.round(s.confidence * 100)}%` : '—'}
                  </td>
                  <td className="px-5 py-3 text-[#5F5E5A]">
                    {s.grade !== null ? 'Complete' : 'Pending'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default Dashboard