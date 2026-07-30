-- Update services to reflect the clinic's official treatment menu.

-- Deactivate services that are no longer offered.
UPDATE public.services
SET is_active = false
WHERE name IN ('Limpeza e Profilaxia', 'Restauração', 'Ortodontia');

-- Rename existing service to match the official menu.
UPDATE public.services
SET name = 'Facetas em Resina',
    description = 'Facetas em resina para harmonização do sorriso, ajustando cor, formato e proporção dos dentes.',
    duration_minutes = 120,
    sort_order = 5
WHERE name = 'Facetas e Lentes';

-- Reorder and update existing services.
UPDATE public.services
SET description = 'Consulta completa com plano de tratamento personalizado.',
    duration_minutes = 45,
    sort_order = 1
WHERE name = 'Avaliação Inicial';

UPDATE public.services
SET description = 'Clareamento dental estético com acompanhamento profissional para um sorriso mais brilhante.',
    duration_minutes = 90,
    sort_order = 4
WHERE name = 'Clareamento Dental';

-- Insert new services only if they do not already exist.
INSERT INTO public.services (name, description, duration_minutes, sort_order, is_active)
SELECT 'Esthetic Aligner', 'Alinhadores estéticos invisíveis para correção ortodôntica discreta e confortável.', 60, 2, true
WHERE NOT EXISTS (SELECT 1 FROM public.services WHERE name = 'Esthetic Aligner');

INSERT INTO public.services (name, description, duration_minutes, sort_order, is_active)
SELECT 'HOF - Fios de Sustentação (PDO)', 'Fios de PDO para reposicionamento e sustentação tecidual, auxiliando na harmonização facial.', 60, 3, true
WHERE NOT EXISTS (SELECT 1 FROM public.services WHERE name = 'HOF - Fios de Sustentação (PDO)');

INSERT INTO public.services (name, description, duration_minutes, sort_order, is_active)
SELECT 'Laserterapia', 'Tratamento a laser para alívio de dores, cicatrização acelerada e cuidados bucais.', 45, 6, true
WHERE NOT EXISTS (SELECT 1 FROM public.services WHERE name = 'Laserterapia');
