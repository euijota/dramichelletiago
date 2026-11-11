-- Add confirmed_at to appointments
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

-- Ensure patient_email can be NULL
ALTER TABLE public.appointments ALTER COLUMN patient_email DROP NOT NULL;