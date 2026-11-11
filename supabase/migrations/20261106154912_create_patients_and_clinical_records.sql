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

CREATE INDEX IF NOT EXISTS idx_patients_name ON public.patients USING btree (name);
CREATE INDEX IF NOT EXISTS idx_patients_cpf ON public.patients USING btree (cpf);
CREATE INDEX IF NOT EXISTS idx_patients_phone ON public.patients USING btree (phone);
CREATE INDEX IF NOT EXISTS idx_patients_legacy_id ON public.patients USING btree (legacy_patient_id);

ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Allow all to authenticated on patients"
    ON public.patients FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Clinical Records Table
CREATE TABLE IF NOT EXISTS public.clinical_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL DEFAULT 'evolucao',
  record_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  title TEXT,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clinical_records_patient ON public.clinical_records(patient_id);
ALTER TABLE public.clinical_records ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Allow all to authenticated on clinical_records"
    ON public.clinical_records FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 3. Odontograms Table
CREATE TABLE IF NOT EXISTS public.odontograms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE UNIQUE,
  dentition_type TEXT NOT NULL DEFAULT 'permanent',
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.odontograms ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Allow all to authenticated on odontograms"
    ON public.odontograms FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 4. Odontogram Procedures Table
CREATE TABLE IF NOT EXISTS public.odontogram_procedures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  odontogram_id UUID NOT NULL REFERENCES public.odontograms(id) ON DELETE CASCADE,
  tooth_number INT NOT NULL,
  surfaces TEXT[] DEFAULT '{}',
  procedure_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned',
  cost NUMERIC(10,2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_odontogram_procedures_odontogram ON public.odontogram_procedures(odontogram_id);
ALTER TABLE public.odontogram_procedures ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Allow all to authenticated on odontogram_procedures"
    ON public.odontogram_procedures FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 5. Appointments columns
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

