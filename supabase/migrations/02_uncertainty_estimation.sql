-- Feature 2: Uncertainty estimation and auto-flag for specialist review
ALTER TABLE screenings
ADD COLUMN IF NOT EXISTS uncertainty_score FLOAT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS uncertainty_tier VARCHAR(20) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS review_reason TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_screenings_needs_review ON screenings(needs_review);
CREATE INDEX IF NOT EXISTS idx_screenings_uncertainty_tier ON screenings(uncertainty_tier);