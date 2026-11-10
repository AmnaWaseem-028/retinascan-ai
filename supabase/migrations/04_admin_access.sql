-- Admins can view all patients and visits (same rule as "Admins can view all screenings")
DROP POLICY IF EXISTS "Admins can view all patients" ON public.patients;
CREATE POLICY "Admins can view all patients"
  ON public.patients FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));
DROP POLICY IF EXISTS "Admins can view all visits" ON public.visits;
CREATE POLICY "Admins can view all visits"
  ON public.visits FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));
