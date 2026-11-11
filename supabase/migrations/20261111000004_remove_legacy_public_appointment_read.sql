-- Apply after the public booking build uses get_public_occupied_slots.
DROP POLICY IF EXISTS public_future_slots ON public.appointments;
REVOKE SELECT (appointment_date, appointment_time, status) ON public.appointments FROM anon;
