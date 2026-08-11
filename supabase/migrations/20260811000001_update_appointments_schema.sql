-- Add confirmed_at to appointments
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

-- Ensure patient_email can be NULL (it was already nullable in some contexts but let's be explicit if needed)
-- Based on the error "Type 'null' is not assignable to type 'string'", 
-- it seems the TypeScript type expects string, but DB might allow null.
-- Let's check the current schema or just ensure it allows null.
ALTER TABLE public.appointments ALTER COLUMN patient_email DROP NOT NULL;
