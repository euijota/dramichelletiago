ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS clinicorp_id TEXT;
CREATE INDEX IF NOT EXISTS idx_patients_clinicorp_id ON public.patients(clinicorp_id);
