CREATE OR REPLACE FUNCTION public.booked_times(_date DATE)
RETURNS TABLE (appointment_time TIME)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.appointment_time
  FROM public.appointments a
  WHERE a.appointment_date = _date
    AND a.status IN ('pending', 'confirmed');
$$;

REVOKE ALL ON FUNCTION public.booked_times(DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.booked_times(DATE) TO anon, authenticated;