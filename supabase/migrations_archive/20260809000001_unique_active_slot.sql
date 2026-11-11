-- P1: Anti double-booking — unique constraint on active slots
-- Only one pending/confirmed appointment per date+time

CREATE UNIQUE INDEX IF NOT EXISTS unique_active_appointment_slot
ON public.appointments (appointment_date, appointment_time)
WHERE status IN ('pending', 'confirmed');

-- Also add duration_minutes to appointments for proper Calendar sync
ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS duration_minutes INTEGER NOT NULL DEFAULT 60;

COMMENT ON COLUMN public.appointments.duration_minutes IS 'Duração do serviço em minutos (para Google Calendar)';