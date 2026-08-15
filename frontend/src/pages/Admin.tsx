import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

interface Screening {
  id: string
  user_id: string
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

function Admin() {
  const navigate = useNavigate()
  const [screenings, setScreenings] = useState<Screening[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [authorized, setAuthorized] = useState<boolean | null>(null)

  const checkAdminAndFetch = async () => {
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setAuthorized(false)
      setLoading(false)
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      setAuthorized(false)
      setLoading(false)
      return
    }

    setAuthorized(true)

    const { data, error } = await supabase
      .from('screenings')
      .select('id, user_id, grade, confidence, created_at')
      .order('created_at', { ascending: false })

    if (error) {
      setError(error.message)
    } else {
      setScreenings(data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    checkAdminAndFetch()
  }, [])

  if (loading) return <div className="p-8 text-sm text-[#888780]">Loading...</div>

  if (authorized === false) {
    return (
      <div className="p-8">
        <div className="bg-white rounded-xl border border-[#D3D1C7] p-12 text-center">
          <p className="text-sm text-[#5F5E5A]">You don't have access to this page.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-[#1B2421] mb-1">Admin panel</h1>
      <p className="text-[#5F5E5A] text-sm mb-8">All screenings across every user.</p>

      {error && <p className="text-sm text-[#C1544C] mb-4">{error}</p>}

      {screenings.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#D3D1C7] p-12 text-center">
          <p className="text-sm text-[#5F5E5A]">No screenings in the system yet.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#D3D1C7] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#D3D1C7] text-left">
                <th className="px-5 py-3 font-medium text-[#5F5E5A]">User ID</th>
                <th className="px-5 py-3 font-medium text-[#5F5E5A]">Date</th>
                <th className="px-5 py-3 font-medium text-[#5F5E5A]">Grade</th>
                <th className="px-5 py-3 font-medium text-[#5F5E5A]">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {screenings.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => navigate(`/result/${s.id}`)}
                  className="border-b border-[#D3D1C7] last:border-0 hover:bg-[#F7F5F1] cursor-pointer"
                >
                  <td className="px-5 py-3 text-[#1B2421] font-mono text-xs">{s.user_id.slice(0, 8)}...</td>
                  <td className="px-5 py-3 text-[#1B2421]">{new Date(s.created_at).toLocaleDateString()}</td>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default Admin