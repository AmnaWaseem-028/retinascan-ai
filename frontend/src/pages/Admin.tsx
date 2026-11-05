import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/useAuth'

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
  const { isAdmin } = useAuth()
  const [screenings, setScreenings] = useState<Screening[]>([])
  const [loading, setLoading] = useState(isAdmin)
  const [error, setError] = useState('')

  const fetchAllScreenings = useCallback(async () => {
    setLoading(true)
    setError('')

    const { data, error: queryError } = await supabase
      .from('screenings')
      .select('id, user_id, grade, confidence, created_at')
      .order('created_at', { ascending: false })

    if (queryError) {
      setError(queryError.message)
    } else {
      setScreenings(data || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!isAdmin) return

    let isCancelled = false

    supabase
      .from('screenings')
      .select('id, user_id, grade, confidence, created_at')
      .order('created_at', { ascending: false })
      .then(({ data, error: queryError }) => {
        if (!isCancelled) {
          if (queryError) {
            setError(queryError.message)
          } else {
            setScreenings(data || [])
          }
          setLoading(false)
        }
      })

    return () => {
      isCancelled = true
    }
  }, [isAdmin])

  if (!isAdmin) {
    return (
      <div className="p-8">
        <div className="bg-white rounded-xl border border-[#D3D1C7] p-12 text-center max-w-lg mx-auto shadow-sm">
          <i className="ti ti-shield-x text-[#C1544C] block mx-auto mb-3" style={{ fontSize: '36px' }}></i>
          <h2 className="text-base font-semibold text-[#1B2421] mb-1">Access Restricted</h2>
          <p className="text-sm text-[#5F5E5A]">You do not have administrative privileges to access this panel.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-[#1B2421] mb-1">Admin panel</h1>
          <p className="text-[#5F5E5A] text-sm">System-wide registry of all clinical screenings.</p>
        </div>
        <button
          onClick={fetchAllScreenings}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#D3D1C7] text-xs font-medium text-[#5F5E5A] hover:bg-white transition-colors"
        >
          <i className="ti ti-refresh"></i>
          Refresh records
        </button>
      </div>

      {loading && (
        <div className="bg-white rounded-xl border border-[#D3D1C7] p-12 text-center shadow-sm">
          <div className="w-8 h-8 border-3 border-[#0F3D3E]/20 border-t-[#0F3D3E] rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-[#888780]">Loading system-wide screenings...</p>
        </div>
      )}

      {error && !loading && (
        <p className="text-sm text-[#C1544C] bg-[#FAECE7] px-4 py-3 rounded-lg mb-4">{error}</p>
      )}

      {!loading && screenings.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#D3D1C7] p-12 text-center shadow-sm">
          <p className="text-sm text-[#5F5E5A]">No screenings in the system yet.</p>
        </div>
      ) : (
        !loading && (
          <div className="bg-white rounded-xl border border-[#D3D1C7] overflow-x-auto shadow-sm">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-[#D3D1C7] text-left bg-[#F7F5F1]">
                  <th className="px-5 py-3 font-medium text-[#5F5E5A] whitespace-nowrap">User ID</th>
                  <th className="px-5 py-3 font-medium text-[#5F5E5A] whitespace-nowrap">Date</th>
                  <th className="px-5 py-3 font-medium text-[#5F5E5A] whitespace-nowrap">Grade</th>
                  <th className="px-5 py-3 font-medium text-[#5F5E5A] whitespace-nowrap">Confidence</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {screenings.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => navigate(`/result/${s.id}`)}
                    className="border-b border-[#D3D1C7] last:border-0 hover:bg-[#F7F5F1] cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-3 text-[#1B2421] font-mono text-xs whitespace-nowrap">
                      {s.user_id ? `${s.user_id.slice(0, 8)}...` : 'Anonymous'}
                    </td>
                    <td className="px-5 py-3 text-[#1B2421] whitespace-nowrap">
                      {new Date(s.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      {s.grade !== null ? (
                        <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-[#E1F5EE] text-[#04342C] whitespace-nowrap">
                          {gradeLabels[s.grade] ?? s.grade}
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-[#FAEEDA] text-[#633806] whitespace-nowrap">
                          Processing
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-[#1B2421] whitespace-nowrap">
                      {s.confidence !== null ? `${Math.round(s.confidence * 100)}%` : '—'}
                    </td>
                    <td className="px-5 py-3 text-right text-[#D3D1C7] whitespace-nowrap">
                      <i className="ti ti-chevron-right"></i>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}

export default Admin
