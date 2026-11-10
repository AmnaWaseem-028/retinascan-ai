import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/useAuth'
import { DIABETES_LABELS, SEX_LABELS, formatDate, type Patient } from '../types/patient'

type PatientRow = Patient & { visits: { count: number }[] | null }

const inputCls =
  'w-full text-xs p-2.5 rounded-lg border border-[#D3D1C7] bg-white focus:outline-none focus:border-[#0F3D3E]'

export default function Patients() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [patients, setPatients] = useState<PatientRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  const [code, setCode] = useState('')
  const [age, setAge] = useState('')
  const [sex, setSex] = useState<Patient['sex']>('male')
  const [dmType, setDmType] = useState<Patient['diabetes_type']>('type_2')
  const [dmYears, setDmYears] = useState('')
  const [hba1c, setHba1c] = useState('')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const { data, error: err } = await supabase
        .from('patients')
        .select('*, visits(count)')
        .order('created_at', { ascending: false })
      if (cancelled) return
      if (err) setError(err.message)
      else setPatients((data || []) as PatientRow[])
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return patients
    return patients.filter((p) => p.patient_code.toLowerCase().includes(term))
  }, [patients, search])

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    const cleanCode = code.trim().toUpperCase()
    const ageNum = Number(age)
    const years = dmYears.trim() === '' ? null : Number(dmYears)
    const hb = hba1c.trim() === '' ? null : Number(hba1c)

    if (!/^[A-Z0-9-]{2,30}$/.test(cleanCode)) {
      setError('Patient ID: 2 to 30 letters, numbers or hyphens only. Do not use a real name.')
      return
    }
    if (age.trim() === '' || !Number.isInteger(ageNum) || ageNum < 0 || ageNum > 130) {
      setError('Age must be a whole number between 0 and 130.')
      return
    }
    if (years !== null && (Number.isNaN(years) || years < 0 || years > 80)) {
      setError('Diabetes duration must be between 0 and 80 years.')
      return
    }
    if (hb !== null && (Number.isNaN(hb) || hb < 3 || hb > 20)) {
      setError('HbA1c must be between 3.0 and 20.0.')
      return
    }
    if (!user) {
      setError('Please sign in again.')
      return
    }

    setSaving(true)
    const { data, error: insErr } = await supabase
      .from('patients')
      .insert({
        user_id: user.id,
        patient_code: cleanCode,
        age: ageNum,
        sex,
        diabetes_type: dmType,
        diabetes_duration_years: years,
        hba1c: hb,
      })
      .select('id')
      .single()
    setSaving(false)

    if (insErr) {
      setError(insErr.code === '23505' ? 'This Patient ID already exists.' : insErr.message)
      return
    }
    navigate(`/patients/${data.id}`)
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-[#0F3D3E]">Patient Records</span>
          <h1 className="text-2xl font-bold text-[#1B2421] mt-0.5">Patients</h1>
          <p className="text-[#5F5E5A] text-sm mt-0.5">
            Pseudonymous records. Each visit holds a right-eye and a left-eye scan.
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0F3D3E] text-white text-sm font-medium hover:bg-[#0C2F30] transition-colors shadow-sm"
        >
          {showForm ? 'Close' : '+ New patient'}
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-[#FAECE7] border border-[#FCA5A5] text-[#C1544C] px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="bg-white rounded-2xl border border-[#D3D1C7] p-5 mb-6 shadow-xs grid grid-cols-2 md:grid-cols-3 gap-4"
        >
          <label className="text-xs font-semibold text-[#1B2421]">
            Patient ID (no real names)
            <input className={`${inputCls} mt-1 uppercase`} value={code} onChange={(e) => setCode(e.target.value)} placeholder="PT-1001" />
          </label>
          <label className="text-xs font-semibold text-[#1B2421]">
            Age
            <input className={`${inputCls} mt-1`} type="number" value={age} onChange={(e) => setAge(e.target.value)} />
          </label>
          <label className="text-xs font-semibold text-[#1B2421]">
            Sex
            <select className={`${inputCls} mt-1`} value={sex} onChange={(e) => setSex(e.target.value as Patient['sex'])}>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-[#1B2421]">
            Diabetes type
            <select className={`${inputCls} mt-1`} value={dmType} onChange={(e) => setDmType(e.target.value as Patient['diabetes_type'])}>
              <option value="type_1">Type 1</option>
              <option value="type_2">Type 2</option>
              <option value="gestational">Gestational</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-[#1B2421]">
            Diabetes duration (years, optional)
            <input className={`${inputCls} mt-1`} type="number" step="0.1" value={dmYears} onChange={(e) => setDmYears(e.target.value)} />
          </label>
          <label className="text-xs font-semibold text-[#1B2421]">
            HbA1c % (optional)
            <input className={`${inputCls} mt-1`} type="number" step="0.1" value={hba1c} onChange={(e) => setHba1c(e.target.value)} />
          </label>
          <div className="col-span-2 md:col-span-3 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-[#0F3D3E] text-white text-xs font-semibold hover:bg-[#0C2F30] disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save patient'}
            </button>
          </div>
        </form>
      )}

      <div className="mb-4">
        <input
          className={`${inputCls} max-w-xs`}
          placeholder="Search Patient ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-[#D3D1C7] p-12 text-center text-sm text-[#5F5E5A]">Loading patients...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#D3D1C7] p-12 text-center text-sm text-[#5F5E5A]">
          No patients yet. Click "+ New patient" to add one.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#D3D1C7] overflow-x-auto shadow-xs">
          <table className="w-full text-xs text-left border-collapse min-w-[720px]">
            <thead>
              <tr className="border-b border-[#D3D1C7] bg-[#F7F5F1] text-[12px] font-semibold text-[#5F5E5A] uppercase tracking-wider">
                <th className="px-4 py-3">Patient ID</th>
                <th className="px-4 py-3">Age / Sex</th>
                <th className="px-4 py-3">Diabetes</th>
                <th className="px-4 py-3">HbA1c</th>
                <th className="px-4 py-3">Visits</th>
                <th className="px-4 py-3">Added</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D3D1C7]/70">
              {filtered.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => navigate(`/patients/${p.id}`)}
                  className="hover:bg-[#F9F8F5] cursor-pointer"
                >
                  <td className="px-4 py-3 font-mono font-bold text-[#0F3D3E]">{p.patient_code}</td>
                  <td className="px-4 py-3">
                    {p.age} · {SEX_LABELS[p.sex]}
                  </td>
                  <td className="px-4 py-3">
                    {DIABETES_LABELS[p.diabetes_type]}
                    {p.diabetes_duration_years !== null && ` · ${p.diabetes_duration_years} yrs`}
                  </td>
                  <td className="px-4 py-3">{p.hba1c !== null ? `${p.hba1c}%` : '—'}</td>
                  <td className="px-4 py-3">{p.visits?.[0]?.count ?? 0}</td>
                  <td className="px-4 py-3 text-[#5F5E5A]">{formatDate(p.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}