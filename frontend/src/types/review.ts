// Feature 4: reviews table ki ek row
export interface Review {
  id: string
  screening_id: string
  reviewer_id: string
  ai_grade: number | null
  final_grade: number
  agrees_with_ai: boolean
  notes: string | null
  created_at: string
  updated_at: string
}
