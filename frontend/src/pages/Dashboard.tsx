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

  const totalCount = screenings.length
  const pendingCount = screenings.filter((s) => s.grade === null).length
  const completedCount = totalCount - pendingCount
  const flaggedCount = screenings.filter((s) => s.grade !== null && s.grade >= 2).length

  const stats = [
    { label: 'Total screenings', value: totalCount, icon: 'ti-clipboard-list' },
    { label: 'Completed', value: completedCount, icon: 'ti-circle-check' },
    { label: 'Pending', value: pendingCount, icon: 'ti-clock' },
    { label: 'Referral needed', value: flaggedCount, icon: 'ti-alert-triangle' },
  ]

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-[#1B2421] mb-1">Screening history</h1>
      <p className="text-[#5F5E5A] text-sm mb-6">All your past diabetic retinopathy screenings.</p>

      <div className="grid grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-[#D3D1C7] p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <i className={`ti ${stat.icon} text-[#0F3D3E]`} style={{ fontSize: '18px' }}></i>
              <p className="text-xs font-medium text-[#5F5E5A]">{stat.label}</p>
            </div>
            <p className="text-2xl font-semibold text-[#1B2421]">{stat.value}</p>
          </div>
        ))}
      </div>

      {loading && <p className="text-sm text-[#888780]">Loading...</p>}
      {error && <p className="text-sm text-[#C1544C]">{error}</p>}

      {!loading && screenings.length === 0 && (
        <div className="bg-white rounded-xl border border-[#D3D1C7] p-12 text-center shadow-sm">
          <i className="ti ti-photo-scan text-[#D3D1C7] block mx-auto mb-3" style={{ fontSize: '36px' }}></i>
          <p className="text-sm text-[#5F5E5A]">No screenings yet. Upload a fundus image to get started.</p>
        </div>
      )}

      {!loading && screenings.length > 0 && (
        <div className="bg-white rounded-xl border border-[#D3D1C7] overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#D3D1C7] text-left bg-[#F7F5F1]">
                <th className="px-5 py-3 font-medium text-[#5F5E5A]">Date</th>
                <th className="px-5 py-3 font-medium text-[#5F5E5A]">Grade</th>
                <th className="px-5 py-3 font-medium text-[#5F5E5A]">Confidence</th>
                <th className="px-5 py-3 font-medium text-[#5F5E5A]">Status</th>
                <th className="px-5 py-3"></th>
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
                  <td className="px-5 py-3 text-right text-[#D3D1C7]">
                    <i className="ti ti-chevron-right"></i>
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