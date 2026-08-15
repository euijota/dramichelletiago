-- Data migration from the former Lovable-managed Supabase project.
-- IDs and timestamps are preserved so future appointment references remain stable.

INSERT INTO public.services (
  id,
  name,
  description,
  duration_minutes,
  is_active,
  sort_order,
  created_at,
  updated_at,
  category,
  price
) VALUES
  ('12d3ce21-6d64-4beb-98ce-6d23f5eab1f0', 'Facetas de Porcelana', 'Laminados cerâmicos para transformar o sorriso.', 120, true, 0, '2026-08-11 01:14:18.364866+00', '2026-08-11 01:14:18.364866+00', 'Estética', NULL),
  ('e072757f-3bbc-49cd-8f01-c1cb0d3b17ff', 'Limpeza e Prevenção', 'Limpeza profissional, remoção de tártaro e aplicação de flúor.', 60, true, 0, '2026-08-11 01:14:18.364866+00', '2026-08-11 01:14:18.364866+00', 'Estética', NULL),
  ('bd6fb7a5-9cdf-4d40-9b87-cbbb2e241c71', 'Clareamento Dental', 'Procedimento para branquear os dentes de forma segura e eficaz.', 90, true, 0, '2026-08-11 01:14:18.364866+00', '2026-08-11 01:14:18.364866+00', 'Estética', NULL),
  ('ad1ca03e-36f4-47d7-bb58-c4627803714a', 'Restaurações', 'Tratamento de cáries e reconstrução da forma dental.', 60, true, 0, '2026-08-11 01:14:18.364866+00', '2026-08-11 01:14:18.364866+00', 'Clínica', NULL),
  ('66889de9-8414-4d50-a6f5-92e4fe39b087', 'Invisalign', 'Alinhamento dental com placas invisíveis de alta tecnologia.', 45, true, 0, '2026-08-11 01:14:18.364866+00', '2026-08-11 01:14:18.364866+00', 'Ortodontia', NULL),
  ('b20eb3f7-3ff2-4c95-9dea-06732e7549ba', 'Implantes', 'Substituição de dentes perdidos com pinos de titânio.', 120, true, 0, '2026-08-11 01:14:18.364866+00', '2026-08-11 01:14:18.364866+00', 'Cirurgia', NULL),
  ('732aeec5-e394-4c90-acc6-4af41b130254', 'Avaliação Inicial', 'Consulta completa com plano de tratamento personalizado.', 45, true, 1, '2026-07-30 01:31:58.046955+00', '2026-07-30 01:31:58.046955+00', NULL, NULL),
  ('bfac74b7-7d77-4fff-8773-ed721942e47c', 'Esthetic Aligner', 'Alinhadores estéticos invisíveis para correção ortodôntica discreta e confortável.', 60, true, 2, '2026-07-30 01:31:58.046955+00', '2026-07-30 01:31:58.046955+00', NULL, NULL),
  ('c7e6ff55-5619-44ad-bac2-f4fd8be6caac', 'HOF - Fios de Sustentação (PDO)', 'Fios de PDO para reposicionamento e sustentação tecidual, auxiliando na harmonização facial.', 60, true, 3, '2026-07-30 01:31:58.046955+00', '2026-07-30 01:31:58.046955+00', NULL, NULL),
  ('3afd8bb6-06ef-4d14-8cfb-cc1448b0ee3e', 'Facetas em Resina', 'Facetas em resina para harmonização do sorriso, ajustando cor, formato e proporção dos dentes.', 120, true, 5, '2026-07-30 01:31:58.046955+00', '2026-07-30 01:31:58.046955+00', NULL, NULL),
  ('6720b899-f245-4a04-81c3-1243a5d13afb', 'Laserterapia', 'Tratamento a laser para alívio de dores, cicatrização acelerada e cuidados bucais.', 45, true, 6, '2026-07-30 01:31:58.046955+00', '2026-07-30 01:31:58.046955+00', NULL, NULL);
