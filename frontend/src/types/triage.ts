// ==============================================================================
// Feature 1: Clinical Triage & Referral Urgency Type Definitions
// ==============================================================================

export type UrgencyTier =
  | 'EMERGENT'
  | 'URGENT'
  | 'SEMI_URGENT'
  | 'ROUTINE'
  | 'ANNUAL_MONITORING'
  | 'QUALITY_RECALL'

export type TriageStatus =
  | 'pending_triage'
  | 'in_review'
  | 'referred'
  | 'completed'

export interface Screening {
  id: string
  user_id: string
  image_url: string | null
  heatmap_url: string | null
  grade: number | null
  confidence: number | null
  report_text: string | null
  created_at: string
  urgency_tier: UrgencyTier | null
  urgency_level: number | null
  referral_timeframe: string | null
  referral_action: string | null
  triage_status: TriageStatus | null
  triage_notes: string | null
  triaged_at: string | null
  triaged_by: string | null
}

export interface UrgencyConfig {
  tier: UrgencyTier
  level: number
  label: string
  priorityLabel: string
  timeframe: string
  badgeBg: string
  badgeText: string
  badgeBorder: string
  dotColor: string
  icon: string
  description: string
  action: string
}

export const URGENCY_CONFIGS: Record<UrgencyTier, UrgencyConfig> = {
  EMERGENT: {
    tier: 'EMERGENT',
    level: 1,
    label: 'Emergent',
    priorityLabel: 'Priority 1',
    timeframe: 'Immediate (24–48 hours)',
    badgeBg: 'bg-[#FEE2E2]',
    badgeText: 'text-[#991B1B]',
    badgeBorder: 'border-[#FCA5A5]',
    dotColor: 'bg-[#DC2626]',
    icon: 'ti-alert-octagon',
    description: 'Proliferative Diabetic Retinopathy (Grade 4)',
    action: 'Immediate vitreoretinal specialist referral. High risk of severe irreversible vision loss.',
  },
  QUALITY_RECALL: {
    tier: 'QUALITY_RECALL',
    level: 1,
    label: 'Quality Recall',
    priorityLabel: 'Priority 1',
    timeframe: 'Immediate recapture',
    badgeBg: 'bg-[#FEF3C7]',
    badgeText: 'text-[#92400E]',
    badgeBorder: 'border-[#FCD34D]',
    dotColor: 'bg-[#D97706]',
    icon: 'ti-camera-rotate',
    description: 'Image Quality Assessment Failed',
    action: 'Recapture fundus photograph immediately. Current image ungradable due to image quality artifacts.',
  },
  URGENT: {
    tier: 'URGENT',
    level: 2,
    label: 'Urgent',
    priorityLabel: 'Priority 2',
    timeframe: '2–4 weeks',
    badgeBg: 'bg-[#FFEDD5]',
    badgeText: 'text-[#9A3412]',
    badgeBorder: 'border-[#FDBA74]',
    dotColor: 'bg-[#EA580C]',
    icon: 'ti-alert-triangle',
    description: 'Severe Non-Proliferative Diabetic Retinopathy (Grade 3)',
    action: 'Priority ophthalmology referral for comprehensive dilated exam and potential anti-VEGF/laser therapy.',
  },
  SEMI_URGENT: {
    tier: 'SEMI_URGENT',
    level: 3,
    label: 'Semi-Urgent',
    priorityLabel: 'Priority 3',
    timeframe: '2–3 months',
    badgeBg: 'bg-[#FEF9C3]',
    badgeText: 'text-[#854D0E]',
    badgeBorder: 'border-[#FDE047]',
    dotColor: 'bg-[#CA8A04]',
    icon: 'ti-clock-exclamation',
    description: 'Moderate Non-Proliferative Diabetic Retinopathy (Grade 2)',
    action: 'Comprehensive dilated eye examination at specialized eye clinic.',
  },
  ROUTINE: {
    tier: 'ROUTINE',
    level: 4,
    label: 'Routine',
    priorityLabel: 'Priority 4',
    timeframe: '6–12 months',
    badgeBg: 'bg-[#E0F2FE]',
    badgeText: 'text-[#075985]',
    badgeBorder: 'border-[#BAE6FD]',
    dotColor: 'bg-[#0284C7]',
    icon: 'ti-calendar-time',
    description: 'Mild Non-Proliferative Diabetic Retinopathy (Grade 1)',
    action: 'Follow-up retinal rescreening in 6–12 months with optimized systemic glycemic and blood pressure control.',
  },
  ANNUAL_MONITORING: {
    tier: 'ANNUAL_MONITORING',
    level: 5,
    label: 'Annual Monitoring',
    priorityLabel: 'Priority 5',
    timeframe: '12 months',
    badgeBg: 'bg-[#DCFCE7]',
    badgeText: 'text-[#166534]',
    badgeBorder: 'border-[#BBF7D0]',
    dotColor: 'bg-[#16A34A]',
    icon: 'ti-circle-check',
    description: 'No Diabetic Retinopathy Detected (Grade 0)',
    action: 'Routine annual diabetic retinal screening. Maintain optimal metabolic control.',
  },
}

export const STATUS_CONFIGS: Record<TriageStatus, { label: string; badgeBg: string; badgeText: string; icon: string }> = {
  pending_triage: {
    label: 'Pending Triage',
    badgeBg: 'bg-[#FAEEDA]',
    badgeText: 'text-[#633806]',
    icon: 'ti-clock',
  },
  in_review: {
    label: 'In Review',
    badgeBg: 'bg-[#E0E7FF]',
    badgeText: 'text-[#3730A3]',
    icon: 'ti-eye',
  },
  referred: {
    label: 'Referred',
    badgeBg: 'bg-[#FCE7F3]',
    badgeText: 'text-[#9D174D]',
    icon: 'ti-arrow-up-right',
  },
  completed: {
    label: 'Completed',
    badgeBg: 'bg-[#E1F5EE]',
    badgeText: 'text-[#04342C]',
    icon: 'ti-check',
  },
}

export const GRADE_LABELS: Record<number, string> = {
  0: 'No DR',
  1: 'Mild',
  2: 'Moderate',
  3: 'Severe',
  4: 'Proliferative',
}

export function deriveUrgency(grade: number | null | undefined, reportText?: string | null): UrgencyConfig {
  if (reportText && reportText.includes('Quality check failed')) {
    return URGENCY_CONFIGS.QUALITY_RECALL
  }
  if (grade === 4) return URGENCY_CONFIGS.EMERGENT
  if (grade === 3) return URGENCY_CONFIGS.URGENT
  if (grade === 2) return URGENCY_CONFIGS.SEMI_URGENT
  if (grade === 1) return URGENCY_CONFIGS.ROUTINE
  if (grade === 0) return URGENCY_CONFIGS.ANNUAL_MONITORING
  return URGENCY_CONFIGS.ROUTINE
}
