-- Recessos do consultório (férias, congresso, viagem): períodos em que a
-- agenda fica bloqueada por inteiro, além dos feriados oficiais.
CREATE TABLE IF NOT EXISTS public.clinic_recesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clinic_recesses_range_valid CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS clinic_recesses_range_idx
  ON public.clinic_recesses (start_date, end_date);

ALTER TABLE public.clinic_recesses ENABLE ROW LEVEL SECURITY;

-- Somente a equipe (autenticada) lê e gerencia. O site público consulta os
-- recessos por server function com service_role (sem expor a tabela).
DROP POLICY IF EXISTS "Allow all to authenticated on clinic_recesses" ON public.clinic_recesses;
CREATE POLICY "Allow all to authenticated on clinic_recesses"
  ON public.clinic_recesses
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
