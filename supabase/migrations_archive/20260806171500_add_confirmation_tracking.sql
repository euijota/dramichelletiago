-- Migration: Add confirmation tracking to appointments table
-- Created: 2026-08-06

ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ DEFAULT NULL;

-- Add index for efficient confirmation queries
CREATE INDEX IF NOT EXISTS idx_appointments_confirmation
ON appointments(confirmed_at, status)
WHERE status IN ('pending', 'confirmed');

-- Comment
COMMENT ON COLUMN appointments.confirmed_at IS 'Timestamp when the patient confirmed the appointment via link';
