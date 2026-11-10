import { type Screening, type UrgencyConfig, deriveUrgency } from './triage'

export type Eye = 'OD' | 'OS' // OD = right eye, OS = left eye

// Screening ke saath Feature 3 ke fields (triage.ts ko chhedna nahi pada)
export type ScreeningWithEye = Screening & {
  patient_id?: string | null
  visit_id?: string | null
  eye?: Eye | null
}

export interface Patient {
  id: string
  user_id: string
  patient_code: string
  age: number
  sex: 'male' | 'female' | 'other'
  diabetes_type: 'type_1' | 'type_2' | 'gestational' | 'other'
  diabetes_duration_years: number | null
  hba1c: number | null
  created_at: string
}

export interface Visit {
  id: string
  patient_id: string
  user_id: string
  visit_date: string
  created_at: string
}

export type ProgressionStatus = 'baseline' | 'stable' | 'improved' | 'progression'

export interface VisitSummary {
  visit: Visit
  od: ScreeningWithEye | null
  os: ScreeningWithEye | null
  overallGrade: number | null // dono aankhon mein se zyada severe
  urgency: UrgencyConfig | null // patient-level urgency
  status: ProgressionStatus
  worsenedEyes: Eye[]
}

export const SEX_LABELS: Record<Patient['sex'], string> = {
  male: 'Male',
  female: 'Female',
  other: 'Other',
}

export const DIABETES_LABELS: Record<Patient['diabetes_type'], string> = {
  type_1: 'Type 1',
  type_2: 'Type 2',
  gestational: 'Gestational',
  other: 'Other',
}

const toLocalDate = (d: string) => new Date(d.length === 10 ? `${d}T00:00:00` : d)

export function formatDate(d: string): string {
  return toLocalDate(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatShortDate(d: string): string {
  return toLocalDate(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

// Har eye ka sabse naya graded scan (agar koi graded nahi to sabse naya scan)
function pickEye(list: ScreeningWithEye[], eye: Eye): ScreeningWithEye | null {
  const mine = list
    .filter((s) => s.eye === eye)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  return mine.find((s) => s.grade !== null) ?? mine[0] ?? null
}

export function buildTimeline(visits: Visit[], screenings: ScreeningWithEye[]): VisitSummary[] {
  const sorted = [...visits].sort(
    (a, b) => a.visit_date.localeCompare(b.visit_date) || a.created_at.localeCompare(b.created_at)
  )

  let prevOverall: number | null = null
  let prevOd: number | null = null
  let prevOs: number | null = null

  return sorted.map((visit) => {
    const list = screenings.filter((s) => s.visit_id === visit.id)
    const od = pickEye(list, 'OD')
    const os = pickEye(list, 'OS')
    const odGrade = od?.grade ?? null
    const osGrade = os?.grade ?? null

    const grades = [odGrade, osGrade].filter((g): g is number => g !== null)
    const overallGrade = grades.length > 0 ? Math.max(...grades) : null

    const changes = {
      overall: overallGrade !== null && prevOverall !== null ? overallGrade - prevOverall : null,
      OD: odGrade !== null && prevOd !== null ? odGrade - prevOd : null,
      OS: osGrade !== null && prevOs !== null ? osGrade - prevOs : null,
    }

    const eyes: Eye[] = ['OD', 'OS']
    const worsenedEyes = eyes.filter((e) => (changes[e] ?? 0) > 0)
    const improved = eyes.some((e) => (changes[e] ?? 0) < 0) || (changes.overall ?? 0) < 0
    const hasComparison = changes.overall !== null || changes.OD !== null || changes.OS !== null

    let status: ProgressionStatus = 'baseline'
    if (hasComparison) {
      if (worsenedEyes.length > 0 || (changes.overall ?? 0) > 0) status = 'progression'
      else if (improved) status = 'improved'
      else status = 'stable'
    }

    if (overallGrade !== null) prevOverall = overallGrade
    if (odGrade !== null) prevOd = odGrade
    if (osGrade !== null) prevOs = osGrade

    return {
      visit,
      od,
      os,
      overallGrade,
      urgency: overallGrade !== null ? deriveUrgency(overallGrade) : null,
      status,
      worsenedEyes,
    }
  })
}