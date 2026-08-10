-- Migration: Add reminder tracking to appointments table
-- Created: 2026-08-06

ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ DEFAULT NULL;

-- Add index for efficient reminder queries
CREATE INDEX IF NOT EXISTS idx_appointments_reminder_lookup
ON appointments(appointment_date, reminder_sent_at, status)
WHERE status IN ('pending', 'confirmed');

-- Comment
COMMENT ON COLUMN appointments.reminder_sent_at IS 'Timestamp when the 24h reminder was sent';
