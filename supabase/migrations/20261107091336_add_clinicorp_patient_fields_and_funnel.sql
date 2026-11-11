ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS nickname TEXT,
  ADD COLUMN IF NOT EXISTS return_alert_date DATE,
  ADD COLUMN IF NOT EXISTS return_alert_notes TEXT,
  ADD COLUMN IF NOT EXISTS funnel_stage TEXT DEFAULT 'triagem';

UPDATE public.patients
SET origin = 'Consultório.me (Triagem)'
WHERE origin IS NULL AND legacy_patient_id IS NOT NULL;

UPDATE public.patients
SET origin = 'Agendamento Online (Site)'
WHERE origin IS NULL AND legacy_patient_id IS NULL;

-- Classify patients into Clinicorp funnel stages:
-- 1. Patients with evolutions, payments, prescriptions, or odontogram procedures -> 'tratamento' (Paciente Ativo no Clinicorp)
UPDATE public.patients p
SET funnel_stage = 'tratamento'
WHERE EXISTS (
  SELECT 1 FROM public.clinical_records cr
  WHERE cr.patient_id = p.id AND cr.record_type IN ('evolucao', 'pagamento', 'receita', 'atestado')
) OR EXISTS (
  SELECT 1 FROM public.odontograms o
  WHERE o.patient_id = p.id
);

-- 2. Patients who filled out anamnesis/formulario but haven't started treatment yet -> 'anamnese'
UPDATE public.patients p
SET funnel_stage = 'anamnese'
WHERE p.funnel_stage = 'triagem'
AND EXISTS (
  SELECT 1 FROM public.clinical_records cr
  WHERE cr.patient_id = p.id AND cr.record_type = 'formulario'
);
