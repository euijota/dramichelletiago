-- 1. Estrutura
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS price DECIMAL(10,2);

-- 2. Permissões
GRANT SELECT ON public.services TO authenticated, anon;
GRANT ALL ON public.services TO service_role;

-- 3. Dados (Limpa duplicatas manuais e insere o menu oficial)
DELETE FROM public.services WHERE name IN ('Limpeza e Prevenção', 'Clareamento Dental', 'Restaurações', 'Invisalign', 'Implantes', 'Facetas de Porcelana');

INSERT INTO public.services (name, category, description, duration_minutes)
VALUES 
('Limpeza e Prevenção', 'Estética', 'Limpeza profissional, remoção de tártaro e aplicação de flúor.', 60),
('Clareamento Dental', 'Estética', 'Procedimento para branquear os dentes de forma segura e eficaz.', 90),
('Restaurações', 'Clínica', 'Tratamento de cáries e reconstrução da forma dental.', 60),
('Invisalign', 'Ortodontia', 'Alinhamento dental com placas invisíveis de alta tecnologia.', 45),
('Implantes', 'Cirurgia', 'Substituição de dentes perdidos com pinos de titânio.', 120),
('Facetas de Porcelana', 'Estética', 'Laminados cerâmicos para transformar o sorriso.', 120);