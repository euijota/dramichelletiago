-- The public booking form treats email as optional, so persistence must do the same.
ALTER TABLE public.appointments
ALTER COLUMN patient_email DROP NOT NULL;
