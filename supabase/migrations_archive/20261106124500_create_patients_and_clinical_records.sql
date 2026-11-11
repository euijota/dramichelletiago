-- Migration: Create Patients, Clinical Records, and Odontograms (Clinicorp style for Dra. Michelle)

-- 1. Patients Table
CREATE TABLE IF NOT EXISTS public.patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_patient_id INT UNIQUE,
  record_number SERIAL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  phone2 TEXT,
  email TEXT,
  cpf TEXT,
  rg TEXT,
  birth_date DATE,
  gender TEXT,
  insurance TEXT,
  insurance_number TEXT,
  origin TEXT,
  profession TEXT,
  marital_status TEXT,
  medical_warning TEXT,
  postal_code TEXT,
  address TEXT,
  address_number TEXT,
  address_extra TEXT,
  neighborhood TEXT,
  city TEXT DEFAULT 'Macapá',
  state TEXT DEFAULT 'AP',
  is_inactive BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for instant search by name, cpf, phone, and record_number
CREATE INDEX IF NOT EXISTS idx_patients_name ON public.patients USING btree (name);
CREATE INDEX IF NOT EXISTS idx_patients_cpf ON public.patients USING btree (cpf);
CREATE INDEX IF NOT EXISTS idx_patients_phone ON public.patients USING btree (phone);
CREATE INDEX IF NOT EXISTS idx_patients_legacy_id ON public.patients USING btree (legacy_patient_id);

-- Enable RLS
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

-- Policies for patients: Admin has full access, authenticated users can read/write
CREATE POLICY "Admins have full access to patients"
  ON public.patients
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 2. Clinical Records Table (Evoluções, Anamnese, Formulários)
CREATE TABLE IF NOT EXISTS public.clinical_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL DEFAULT 'evolucao', -- 'evolucao', 'anamnese', 'formulario', 'receita', 'atestado'
  record_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  title TEXT,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clinical_records_patient ON public.clinical_records(patient_id);
ALTER TABLE public.clinical_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins have full access to clinical_records"
  ON public.clinical_records
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 3. Odontograms Table
CREATE TABLE IF NOT EXISTS public.odontograms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE UNIQUE,
  dentition_type TEXT NOT NULL DEFAULT 'permanent', -- 'permanent', 'deciduous', 'mixed'
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.odontograms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins have full access to odontograms"
  ON public.odontograms
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 4. Odontogram Procedures Table (Dente a dente / Faces)
CREATE TABLE IF NOT EXISTS public.odontogram_procedures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  odontogram_id UUID NOT NULL REFERENCES public.odontograms(id) ON DELETE CASCADE,
  tooth_number INT NOT NULL, -- 11..48 (permanente), 51..85 (decíduo)
  surfaces TEXT[] DEFAULT '{}', -- ['mesial', 'distal', 'oclusal', 'vestibular', 'lingual']
  procedure_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned', -- 'planned', 'in_progress', 'completed'
  cost NUMERIC(10,2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_odontogram_procedures_odontogram ON public.odontogram_procedures(odontogram_id);
ALTER TABLE public.odontogram_procedures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins have full access to odontogram_procedures"
  ON public.odontogram_procedures
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 5. Add patient_id to appointments if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'appointments' AND column_name = 'patient_id'
  ) THEN
    ALTER TABLE public.appointments ADD COLUMN patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'appointments' AND column_name = 'legacy_patient_id'
  ) THEN
    ALTER TABLE public.appointments ADD COLUMN legacy_patient_id INT;
  END IF;
END $$;
