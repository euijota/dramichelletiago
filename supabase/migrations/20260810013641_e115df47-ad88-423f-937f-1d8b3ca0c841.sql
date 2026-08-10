CREATE UNIQUE INDEX IF NOT EXISTS unique_active_appointment_slot
ON public.appointments (appointment_date, appointment_time)
WHERE status IN ('pending', 'confirmed');

ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS duration_minutes INTEGER NOT NULL DEFAULT 60;