-- Feature 4: clinician review and override (human-in-the-loop)
CREATE TABLE IF NOT EXISTS public.reviews (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  screening_id   uuid NOT NULL UNIQUE REFERENCES public.screenings(id) ON DELETE CASCADE,
  reviewer_id    uuid NOT NULL REFERENCES auth.users(id) DEFAULT auth.uid(),
  ai_grade       integer CHECK (ai_grade BETWEEN 0 AND 4),
  final_grade    integer NOT NULL CHECK (final_grade BETWEEN 0 AND 4),
  agrees_with_ai boolean GENERATED ALWAYS AS (final_grade IS NOT DISTINCT FROM ai_grade) STORED,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
-- Jo user ek screening dekh sakta hai (apni ya admin ke liye sab), wahi uska review dekh sakta hai.
DROP POLICY IF EXISTS "Users can view reviews of visible screenings" ON public.reviews;
CREATE POLICY "Users can view reviews of visible screenings"
  ON public.reviews FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.screenings s WHERE s.id = reviews.screening_id));
DROP POLICY IF EXISTS "Users can add reviews to visible screenings" ON public.reviews;
CREATE POLICY "Users can add reviews to visible screenings"
  ON public.reviews FOR INSERT TO authenticated
  WITH CHECK (
    reviewer_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.screenings s WHERE s.id = reviews.screening_id)
  );
DROP POLICY IF EXISTS "Users can update reviews of visible screenings" ON public.reviews;
CREATE POLICY "Users can update reviews of visible screenings"
  ON public.reviews FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.screenings s WHERE s.id = reviews.screening_id))
  WITH CHECK (reviewer_id = auth.uid());
-- Table privileges (iske bina "permission denied for table" aata hai)
GRANT SELECT, INSERT, UPDATE ON TABLE public.reviews TO authenticated;
GRANT ALL ON TABLE public.reviews TO service_role;
