-- ==============================================================================
-- Migration: 01_referral_urgency_triage.sql
-- Description: Adds clinical triage and referral urgency fields to the screenings table
-- Feature: Feature 1 - Referral Urgency & Triage Worklist
-- ==============================================================================

-- 1. Add triage fields to the screenings table
ALTER TABLE screenings
ADD COLUMN IF NOT EXISTS urgency_tier VARCHAR(30),
ADD COLUMN IF NOT EXISTS urgency_level INTEGER,
ADD COLUMN IF NOT EXISTS referral_timeframe VARCHAR(100),
ADD COLUMN IF NOT EXISTS referral_action TEXT,
ADD COLUMN IF NOT EXISTS triage_status VARCHAR(30) DEFAULT 'pending_triage',
ADD COLUMN IF NOT EXISTS triage_notes TEXT,
ADD COLUMN IF NOT EXISTS triaged_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS triaged_by UUID REFERENCES auth.users(id);

-- 2. Add performance index for priority ordering (urgency_level ASC, created_at DESC)
CREATE INDEX IF NOT EXISTS idx_screenings_urgency_priority 
ON screenings (urgency_level ASC, created_at DESC);

-- 3. Add index for filtering by triage_status
CREATE INDEX IF NOT EXISTS idx_screenings_triage_status 
ON screenings (triage_status);

-- 4. Backfill existing screenings with computed clinical triage matrix values
UPDATE screenings
SET 
  urgency_tier = CASE 
    WHEN grade = 4 THEN 'EMERGENT'
    WHEN grade = 3 THEN 'URGENT'
    WHEN grade = 2 THEN 'SEMI_URGENT'
    WHEN grade = 1 THEN 'ROUTINE'
    WHEN grade = 0 THEN 'ANNUAL_MONITORING'
    ELSE 'QUALITY_RECALL'
  END,
  urgency_level = CASE 
    WHEN grade = 4 THEN 1
    WHEN grade = 3 THEN 2
    WHEN grade = 2 THEN 3
    WHEN grade = 1 THEN 4
    WHEN grade = 0 THEN 5
    ELSE 1
  END,
  referral_timeframe = CASE 
    WHEN grade = 4 THEN 'Immediate (24–48 hours)'
    WHEN grade = 3 THEN '2–4 weeks'
    WHEN grade = 2 THEN '2–3 months'
    WHEN grade = 1 THEN '6–12 months'
    WHEN grade = 0 THEN '12 months'
    ELSE 'Immediate recapture'
  END,
  referral_action = CASE 
    WHEN grade = 4 THEN 'Immediate vitreoretinal specialist referral. High risk of severe irreversible vision loss.'
    WHEN grade = 3 THEN 'Priority ophthalmology referral for comprehensive dilated exam and potential anti-VEGF/laser therapy.'
    WHEN grade = 2 THEN 'Comprehensive dilated eye examination at specialized eye clinic.'
    WHEN grade = 1 THEN 'Follow-up retinal rescreening in 6–12 months with optimized systemic glycemic and blood pressure control.'
    WHEN grade = 0 THEN 'Routine annual diabetic retinal screening. Maintain optimal metabolic control.'
    ELSE 'Recapture fundus photograph immediately. Current image ungradable due to image quality artifacts.'
  END,
  triage_status = COALESCE(triage_status, 'pending_triage')
WHERE urgency_tier IS NULL AND (grade IS NOT NULL OR report_text LIKE 'Quality check failed%');
