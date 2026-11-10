-- Feature 3: patients, visits, both-eye (OD/OS) linkage

CREATE TABLE IF NOT EXISTS patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    patient_code VARCHAR(30) NOT NULL,
    age INTEGER NOT NULL CHECK (age BETWEEN 0 AND 130),
    sex VARCHAR(10) NOT NULL CHECK (sex IN ('male', 'female', 'other')),
    diabetes_type VARCHAR(20) NOT NULL CHECK (diabetes_type IN ('type_1', 'type_2', 'gestational', 'other')),
    diabetes_duration_years NUMERIC(4, 1) CHECK (diabetes_duration_years >= 0),
    hba1c NUMERIC(4, 1) CHECK (hba1c BETWEEN 3.0 AND 20.0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_patient_code UNIQUE (user_id, patient_code)
);

CREATE TABLE IF NOT EXISTS visits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    visit_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE screenings
    ADD COLUMN IF NOT EXISTS patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS visit_id UUID REFERENCES visits(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS eye VARCHAR(2) CHECK (eye IN ('OD', 'OS'));

CREATE INDEX IF NOT EXISTS idx_visits_patient_id ON visits(patient_id);
CREATE INDEX IF NOT EXISTS idx_screenings_patient_id ON screenings(patient_id);
CREATE INDEX IF NOT EXISTS idx_screenings_visit_id ON screenings(visit_id);

ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "patients_owner_all" ON patients;
CREATE POLICY "patients_owner_all" ON patients
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "visits_owner_all" ON visits;
CREATE POLICY "visits_owner_all" ON visits
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);-- Table privileges for the Data API roles (without these: "permission denied for table")
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.patients TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.visits TO authenticated;
GRANT ALL ON TABLE public.patients TO service_role;
GRANT ALL ON TABLE public.visits TO service_role;
